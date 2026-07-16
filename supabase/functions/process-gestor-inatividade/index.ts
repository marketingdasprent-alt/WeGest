// supabase/functions/process-gestor-inatividade/index.ts
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Periodo {
  id: string;
  org_id: string;
  gestor_id: string;
  data_inicio: string;
  data_fim: string;
  status: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY')!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const sendEmail = async (
    orgNome: string,
    toEmail: string,
    toName: string,
    subject: string,
    html: string
  ) => {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: `${orgNome} CRM`, email: 'noreply@dasprent.pt' },
        to: [{ email: toEmail, name: toName }],
        subject,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(`Brevo error para ${toEmail}: ${JSON.stringify(err)}`);
    }
  };

  const buildHtml = (orgNome: string, mensagem: string) => `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;background:#f5f5f5">
  <div style="background:linear-gradient(135deg,#1e3a5f 0%,#2d6a9f 100%);padding:24px;border-radius:12px;text-align:center;margin-bottom:20px">
    <h1 style="color:white;margin:0;font-size:20px">Aviso de Disponibilidade</h1>
    <p style="color:rgba(255,255,255,0.85);margin:8px 0 0">${orgNome}</p>
  </div>
  <div style="background:white;padding:24px;border-radius:12px">
    <p style="margin:0">${mensagem}</p>
  </div>
  <div style="text-align:center;color:#888;font-size:12px;padding:16px">
    <p>Email automático — ${orgNome}. Não responda a esta mensagem.</p>
  </div>
</body>
</html>`;

  const notificarMotoristas = async (
    orgId: string,
    gestorNome: string,
    orgNome: string,
    subject: string,
    mensagem: string
  ) => {
    const { data: motoristas } = await supabase
      .from('motoristas_ativos')
      .select('nome, email')
      .eq('org_id', orgId)
      .eq('gestor_responsavel', gestorNome)
      .not('email', 'is', null);

    const html = buildHtml(orgNome, mensagem);
    for (const m of motoristas || []) {
      try {
        await sendEmail(orgNome, m.email as string, m.nome as string, subject, html);
      } catch (err) {
        console.error(`Falha ao notificar ${m.email}:`, err);
      }
    }
  };

  const buscarGestorEOrg = async (periodo: Periodo) => {
    const [{ data: gestor }, { data: org }] = await Promise.all([
      supabase.from('profiles').select('nome').eq('id', periodo.gestor_id).single(),
      supabase.from('organizacoes').select('nome').eq('id', periodo.org_id).single(),
    ]);
    if (!gestor || !org) throw new Error('Gestor ou organização não encontrados');
    return { gestorNome: gestor.nome as string, orgNome: org.nome as string };
  };

  const ativar = async (periodo: Periodo) => {
    const { gestorNome, orgNome } = await buscarGestorEOrg(periodo);

    await supabase
      .from('profiles')
      .update({ disponivel_transferista: false })
      .eq('id', periodo.gestor_id);

    await supabase
      .from('gestor_periodos_inatividade')
      .update({ status: 'ativo', notificado_inicio_em: new Date().toISOString() })
      .eq('id', periodo.id);

    const dataFimFmt = new Date(periodo.data_fim).toLocaleDateString('pt-PT');
    await notificarMotoristas(
      periodo.org_id,
      gestorNome,
      orgNome,
      `${gestorNome} está inativo até ${dataFimFmt}`,
      `O seu gestor, <strong>${gestorNome}</strong>, está inativo até <strong>${dataFimFmt}</strong>. Para assuntos urgentes, contacte o administrador da organização.`
    );
  };

  const concluir = async (periodo: Periodo) => {
    const { gestorNome, orgNome } = await buscarGestorEOrg(periodo);

    await supabase
      .from('profiles')
      .update({ disponivel_transferista: true })
      .eq('id', periodo.gestor_id);

    await supabase
      .from('gestor_periodos_inatividade')
      .update({ status: 'concluido', notificado_fim_em: new Date().toISOString() })
      .eq('id', periodo.id);

    await notificarMotoristas(
      periodo.org_id,
      gestorNome,
      orgNome,
      `${gestorNome} está novamente disponível`,
      `O seu gestor, <strong>${gestorNome}</strong>, está novamente disponível.`
    );
  };

  try {
    const body = await req.json().catch(() => ({}));
    const { periodoId, forcar } = body as { periodoId?: string; forcar?: 'ativar' | 'concluir' };

    // ── Modo single: acionado pelo frontend p/ ativação/conclusão imediata ──
    if (periodoId && forcar) {
      const authHeader = req.headers.get('Authorization') || '';
      const jwt = authHeader.replace('Bearer ', '');
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(jwt);
      if (authError || !user) {
        return new Response(JSON.stringify({ success: false, error: 'Não autenticado' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: periodo, error: periodoError } = await supabase
        .from('gestor_periodos_inatividade')
        .select('*')
        .eq('id', periodoId)
        .single();
      if (periodoError || !periodo) {
        return new Response(JSON.stringify({ success: false, error: 'Período não encontrado' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: callerProfile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();
      const isOwner = periodo.gestor_id === user.id;
      const isAdmin = !!callerProfile?.is_admin;
      if (!isOwner && !isAdmin) {
        return new Response(JSON.stringify({ success: false, error: 'Sem permissão' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (forcar === 'ativar' && periodo.status === 'agendado') {
        await ativar(periodo as Periodo);
      }
      if (forcar === 'concluir' && periodo.status === 'ativo') {
        const hoje = new Date().toISOString().split('T')[0];
        let periodoParaConcluir = periodo as Periodo;
        if (periodo.data_fim > hoje) {
          await supabase
            .from('gestor_periodos_inatividade')
            .update({ data_fim: hoje })
            .eq('id', periodo.id);
          periodoParaConcluir = { ...periodoParaConcluir, data_fim: hoje };
        }
        await concluir(periodoParaConcluir);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Modo cron: corre 1x por dia, processa todos os períodos em falta ────
    const hoje = new Date().toISOString().split('T')[0];

    const { data: aAtivar } = await supabase
      .from('gestor_periodos_inatividade')
      .select('*')
      .eq('status', 'agendado')
      .lte('data_inicio', hoje);

    for (const periodo of aAtivar || []) {
      try {
        await ativar(periodo as Periodo);
      } catch (err) {
        console.error(`Falha ao ativar período ${periodo.id}:`, err);
      }
    }

    const { data: aConcluir } = await supabase
      .from('gestor_periodos_inatividade')
      .select('*')
      .eq('status', 'ativo')
      .lt('data_fim', hoje);

    for (const periodo of aConcluir || []) {
      try {
        await concluir(periodo as Periodo);
      } catch (err) {
        console.error(`Falha ao concluir período ${periodo.id}:`, err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        ativados: aAtivar?.length ?? 0,
        concluidos: aConcluir?.length ?? 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('process-gestor-inatividade error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
