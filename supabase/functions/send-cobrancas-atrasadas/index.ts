// supabase/functions/send-cobrancas-atrasadas/index.ts
// I3 da auditoria — aviso único ao devedor quando uma cobrança passa 30
// dias em aberto. Chamado por emit_lembretes_cobranca_atrasada() via
// net.http_post (mesmo padrão de send-recibo-anulado-email) — o
// destinatário é o cliente/motorista devedor, que pode não ter conta
// auth.users, por isso não passa por notifications/notification_queue.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { EmailProviderFactory } from '../_shared/email/factories/EmailProviderFactory.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CobrancaAtrasada {
  org_id: string;
  destinatario_nome: string;
  destinatario_email: string;
  saldo: number;
  dias_em_aberto: number;
}

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(val);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { cobrancas }: { cobrancas: CobrancaAtrasada[] } = await req.json();

    if (!cobrancas || cobrancas.length === 0) {
      throw new Error('No cobrancas provided');
    }

    const results: Array<{ email: string; success: boolean; error?: string }> = [];

    for (const c of cobrancas) {
      try {
        const { provider, sender } = await EmailProviderFactory.getProvider(c.org_id, supabase);

        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <p>Olá <strong>${c.destinatario_nome}</strong>,</p>
            <p>Identificámos uma cobrança em aberto há ${c.dias_em_aberto} dias, no valor de <strong>${formatCurrency(c.saldo)}</strong>.</p>
            <p>Por favor regulariza o pagamento assim que possível. Se já procedeste ao pagamento, ignora este aviso.</p>
            <p>Qualquer dúvida, contacta a equipa administrativa.</p>
          </div>
        `;

        const result = await provider.send({
          to: [{ email: c.destinatario_email, name: c.destinatario_nome }],
          subject: `Cobrança em aberto há ${c.dias_em_aberto} dias`,
          html,
          senderOverride: sender,
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
