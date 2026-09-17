// supabase/functions/send-cobrancas-atrasadas/index.ts
// I3 da auditoria — aviso único ao devedor quando uma cobrança passa 30
// dias em aberto. Chamado por emit_lembretes_cobranca_atrasada() via
// net.http_post (mesmo padrão de send-recibo-anulado-email) — o
// destinatário é o cliente/motorista devedor, que pode não ter conta
// auth.users, por isso não passa por notifications/notification_queue.
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { EmailService } from '../_shared/email/services/EmailService.ts';
import { resolverEmissorDoEmail } from '../_shared/email/emissor.ts';

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
        // A marca é a da EMPRESA EMISSORA do contrato da cobrança (Dasp Rent
        // Sul, Distância Arrojada, …), não a da organização — o cliente só
        // conhece a empresa com quem assinou. A 15/09/2026 uma fatura da Dasp
        // Rent Sul saiu com o nome e o logo da Década Ousada por isto.
        const emissor = await resolverEmissorDoEmail(supabase, {
          orgId: c.org_id,
          cobrancaId: c.id,
        });

        const result = await emailService.sendCobrancaAtraso(c.org_id, {
          destinatarioNome: c.destinatario_nome,
          numeroFatura: `COB-${c.id.slice(0, 8).toUpperCase()}`,
          valorTotal: c.saldo,
          diasAtraso: c.dias_em_aberto,
          emissorNome: emissor.emissorNome,
          emissorLogoUrl: emissor.emissorLogoUrl,
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
