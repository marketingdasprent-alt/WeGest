// supabase/functions/send-cobrancas-atrasadas/index.ts
// I3 da auditoria — aviso único ao devedor quando uma cobrança passa 30
// dias em aberto. Chamado por emit_lembretes_cobranca_atrasada() via
// net.http_post (mesmo padrão de send-recibo-anulado-email) — o
// destinatário é o cliente/motorista devedor, que pode não ter conta
// auth.users, por isso não passa por notifications/notification_queue.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { EmailService } from '../_shared/email/services/EmailService.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CobrancaAtrasada {
  id: string;
  org_id: string;
  destinatario_nome: string;
  destinatario_email: string;
  saldo: number;
  dias_em_aberto: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const emailService = new EmailService(supabase);

    const { cobrancas }: { cobrancas: CobrancaAtrasada[] } = await req.json();

    if (!cobrancas || cobrancas.length === 0) {
      throw new Error('No cobrancas provided');
    }

    const results: Array<{ email: string; success: boolean; error?: string }> = [];

    for (const c of cobrancas) {
      try {
        const { data: org } = await supabase
          .from('organizacoes')
          .select('nome, logo_url')
          .eq('id', c.org_id)
          .maybeSingle();

        const result = await emailService.sendCobrancaAtraso(c.org_id, {
          destinatarioNome: c.destinatario_nome,
          numeroFatura: `COB-${c.id.slice(0, 8).toUpperCase()}`,
          valorTotal: c.saldo,
          diasAtraso: c.dias_em_aberto,
          emissorNome: org?.nome,
          emissorLogoUrl: org?.logo_url,
          to: c.destinatario_email,
          toNome: c.destinatario_nome,
        });

        results.push({ email: c.destinatario_email, success: result.success, error: result.success ? undefined : result.error });
      } catch (itemError) {
        results.push({
          email: c.destinatario_email,
          success: false,
          error: itemError instanceof Error ? itemError.message : String(itemError),
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('send-cobrancas-atrasadas falhou:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
