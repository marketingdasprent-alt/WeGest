import { createClient } from 'npm:@supabase/supabase-js@2';
import { EmailService } from '../_shared/email/services/EmailService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const emailService = new EmailService(supabase);

    const today = new Date();

    // ── Multi-tenant: iterar por cada org ativa ──────────────────────────────
    const { data: orgs } = await supabase
      .from('organizacoes')
      .select('id, nome')
      .eq('ativa', true);

    if (!orgs || orgs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Sem organizações ativas' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Processar alertas para cada org
    let totalAlertasGlobal = 0;
    const allSentTo: string[] = [];

    for (const org of orgs) {
    const orgId = org.id;
    const orgNome = org.nome;

    // ── Extintores: validade <= today + 15 dias ──────────────────────────────
    const limitExtintor = new Date(today);
    limitExtintor.setDate(limitExtintor.getDate() + 15);
    const limitExtintorStr = limitExtintor.toISOString().split('T')[0];

    const { data: extintores } = await supabase
      .from('motorista_viaturas')
      .select(`
        id,
        extintor_validade,
        extintor_numero,
        motoristas ( id, nome, gestor_responsavel ),
        viaturas ( matricula )
      `)
      .eq('status', 'ativo')
      .eq('org_id', orgId)
      .not('extintor_validade', 'is', null)
      .lte('extintor_validade', limitExtintorStr)
      .order('extintor_validade', { ascending: true });

    // ── Contratos: assinatura + 12 meses <= today + 15 dias ─────────────────
    const upperContrato = new Date(limitExtintor);
    upperContrato.setFullYear(upperContrato.getFullYear() - 1);
    const upperContratoStr = upperContrato.toISOString().split('T')[0];

    const lowerContrato = new Date(today);
    lowerContrato.setDate(lowerContrato.getDate() - 60);
    lowerContrato.setFullYear(lowerContrato.getFullYear() - 1);
    const lowerContratoStr = lowerContrato.toISOString().split('T')[0];

    const { data: contratos } = await supabase
      .from('motorista_viaturas')
      .select(`
        id,
        contrato_prestacao_assinatura,
        motoristas ( id, nome, gestor_responsavel ),
        viaturas ( matricula )
      `)
      .eq('status', 'ativo')
      .eq('org_id', orgId)
      .not('contrato_prestacao_assinatura', 'is', null)
      .gte('contrato_prestacao_assinatura', lowerContratoStr)
      .lte('contrato_prestacao_assinatura', upperContratoStr)
      .order('contrato_prestacao_assinatura', { ascending: true });

    const totalAlertas = (extintores?.length ?? 0) + (contratos?.length ?? 0);
    totalAlertasGlobal += totalAlertas;
    if (totalAlertas === 0) continue;

    // ── Supervisores Gestores TVDE desta org ─────────────────────────────────
    const { data: supervisoresProfiles } = await supabase
      .from('profiles')
      .select('email, nome')
      .eq('org_id', orgId)
      .not('email', 'is', null)
      .eq('cargo', 'Supervisor Gestor TVDE');

    const { data: supervisoresCargo } = await supabase
      .from('profiles')
      .select('email, nome, cargos ( nome )')
      .eq('org_id', orgId)
      .not('email', 'is', null);

    const supervisorEmails = new Map<string, string>();
    (supervisoresProfiles || []).forEach(s => {
      if (s.email && s.nome) supervisorEmails.set(s.email, s.nome);
    });
    (supervisoresCargo || []).forEach((s: any) => {
      if (s.email && s.cargos?.nome === 'Supervisor Gestor TVDE') {
        supervisorEmails.set(s.email, s.nome || 'Supervisor');
      }
    });

    // ── Emails dos gestores responsáveis ─────────────────────────────────────
    const gestorNomes = new Set<string>();
    [...(extintores || []), ...(contratos || [])].forEach((item: any) => {
      const gestor = item.motoristas?.gestor_responsavel;
      if (gestor) gestorNomes.add(gestor);
    });

    const gestorEmailMap = new Map<string, string>();
    if (gestorNomes.size > 0) {
      const { data: gestorProfiles } = await supabase
        .from('profiles')
        .select('nome, email')
        .eq('org_id', orgId)
        .in('nome', [...gestorNomes])
        .not('email', 'is', null);

      (gestorProfiles || []).forEach((p: any) => {
        if (p.nome && p.email) gestorEmailMap.set(p.nome, p.email);
      });
    }

    const sentTo: string[] = [];

    // Gestores: cada um recebe apenas os alertas dos seus motoristas
    for (const [gestorNome, gestorEmail] of gestorEmailMap.entries()) {
      const gestorExt = (extintores || []).filter(
        (e: any) => e.motoristas?.gestor_responsavel === gestorNome
      );
      const gestorCt = (contratos || []).filter(
        (c: any) => c.motoristas?.gestor_responsavel === gestorNome
      );
      if (gestorExt.length === 0 && gestorCt.length === 0) continue;
      await emailService.sendAlertaExpiracao(orgId, {
        to: gestorEmail,
        toNome: gestorNome,
        orgNome,
        today,
        extintores: gestorExt,
        contratos: gestorCt,
        recipientName: gestorNome,
      });
      sentTo.push(gestorEmail);
    }

    // Supervisores: recebem todos os alertas
    for (const [email, nome] of supervisorEmails.entries()) {
      await emailService.sendAlertaExpiracao(orgId, {
        to: email,
        toNome: nome,
        orgNome,
        today,
        extintores: extintores || [],
        contratos: contratos || [],
        recipientName: nome,
      });
      sentTo.push(email);
    }

    allSentTo.push(...sentTo);
    console.log(`[${orgNome}] Alertas enviados para: ${sentTo.join(', ')}`);

    } // fim do loop de orgs

    return new Response(
      JSON.stringify({ success: true, sentTo: allSentTo, totalAlertas: totalAlertasGlobal }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('send-alertas-expiracoes error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
