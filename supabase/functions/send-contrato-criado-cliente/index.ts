import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { EmailService } from '../_shared/email/services/EmailService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Avisa por email o cliente de que o contrato de aluguer foi criado.
 * Chamada pelo trigger `fn_contratos_renting_criado_domain_event` via
 * pg_net — o cliente não tem conta auth.users, por isso não passa por
 * notifications/notification_queue (mesmo padrão de
 * send-cobrancas-atrasadas/send-recibo-anulado-email).
 */
interface ContratoCriadoRequest {
  orgId: string;
  contratoId: string;
  destinatarioNome: string;
  destinatarioEmail: string;
  matricula: string;
  regime?: string | null;
  dataInicio?: string | null;
  valor?: number | null;
}

function fmtDatePt(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-PT');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const p: ContratoCriadoRequest = await req.json();
    if (!p.orgId || !p.contratoId || !p.destinatarioEmail) {
      return new Response(JSON.stringify({ error: 'orgId, contratoId e destinatarioEmail são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const emailService = new EmailService(supabase);

    const { data: org } = await supabase
      .from('organizacoes')
      .select('nome, logo_url, codigo')
      .eq('id', p.orgId)
      .maybeSingle();

    const base = Deno.env.get('APP_URL') || (org?.codigo ? `https://${org.codigo}.wegest.pt` : undefined);
    const ctaUrl = base ? `${base}/renting/contratos/${p.contratoId}` : undefined;

    const result = await emailService.sendContrato(p.orgId, {
      tipo: 'criado',
      destinatarioNome: p.destinatarioNome,
      matricula: p.matricula,
      dataInicioFmt: fmtDatePt(p.dataInicio),
      valorMensal: p.valor ?? undefined,
      motoristaNome: p.destinatarioNome,
      emissorNome: org?.nome,
      emissorLogoUrl: org?.logo_url,
      ctaUrl,
      to: p.destinatarioEmail,
      toNome: p.destinatarioNome,
    });

    return new Response(JSON.stringify({ success: result.success, error: result.error }), {
      status: result.success ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('send-contrato-criado-cliente falhou:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
