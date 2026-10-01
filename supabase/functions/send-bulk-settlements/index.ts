import { RequestBodyError } from '../_shared/http/boundedJson.ts';
import { readSettlements } from '../_shared/weekly-settlements/requestSchemas.ts';
import { escapeHtml } from '../_shared/notification-queue/renderTemplate.ts';
import { AuthorizationError, requireInternalRequest } from '../_shared/auth/edgeAuthorization.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(null, { status: 405, headers: { ...corsHeaders, Allow: 'POST, OPTIONS' } });
  }

  try {
    requireInternalRequest(req, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const brevoApiKey = Deno.env.get('BREVO_API_KEY');
    if (!brevoApiKey) {
      throw new Error('BREVO_API_KEY not configured');
    }

    const items = await readSettlements(req);

    const results = [];

    for (const item of items) {
      if (!item.ok) {
        results.push({ email: item.label, success: false, error: item.error });
        continue;
      }
      const s = item.settlement;
      if (!s.email) {
        results.push({ email: s.driver_name, success: false, error: 'Email não cadastrado' });
        continue;
      }

      const formatCurrency = (val: number) =>
        new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(val);

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
            .header { background: #000; color: #fff; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { padding: 20px; border: 1px solid #eee; border-top: none; border-radius: 0 0 8px 8px; }
            .summary-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .summary-table td { padding: 10px; border-bottom: 1px solid #eee; }
            .font-bold { font-weight: bold; }
            .text-green { color: #16a34a; }
            .text-red { color: #dc2626; }
            .footer { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
            .total-row { background: #f8fafc; font-size: 18px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin:0;">Resumo de Contas</h1>
            <p style="margin:5px 0 0 0; opacity: 0.8;">${escapeHtml(s.periodo)}</p>
          </div>
          <div class="content">
            <p>Olá <strong>${escapeHtml(s.driver_name)}</strong>,</p>
            <p>Segue abaixo o detalhamento do seu acerto financeiro referente ao período de ${escapeHtml(s.periodo)}.</p>
            
            <table class="summary-table">
              <tr>
                <td>Faturado Bolt</td>
                <td class="text-green">${formatCurrency(s.faturado_bolt)}</td>
              </tr>
              <tr>
                <td>Faturado Uber</td>
                <td class="text-green">${formatCurrency(s.faturado_uber)}</td>
              </tr>
              <tr>
                <td>Aluguer de Viatura</td>
                <td class="text-red">-${formatCurrency(s.aluguer)}</td>
              </tr>
              ${
                (s.combustivel ?? 0) > 0
                  ? `
              <tr>
                <td>Custos de Combustível</td>
                <td class="text-red">-${formatCurrency(s.combustivel!)}</td>
              </tr>`
                  : ''
              }
              ${
                (s.reparacoes ?? 0) > 0
                  ? `
              <tr>
                <td>Reparações</td>
                <td class="text-red">-${formatCurrency(s.reparacoes!)}</td>
              </tr>`
                  : ''
              }
              ${
                (s.outros_custos ?? 0) > 0
                  ? `
              <tr>
                <td>Outros Custos/Ajustes</td>
                <td class="text-red">-${formatCurrency(s.outros_custos!)}</td>
              </tr>`
                  : ''
              }
              <tr class="total-row font-bold">
                <td>VALOR LÍQUIDO A RECEBER</td>
                <td class="${s.liquido >= 0 ? 'text-green' : 'text-red'}">${formatCurrency(s.liquido)}</td>
              </tr>
            </table>

            <p>Se tiver alguma dúvida, por favor entre em contacto com a equipa administrativa.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Década Ousada, Lda. • NIF: 515127850</p>
            <p>Este é um email automático, por favor não responda.</p>
          </div>
        </body>
        </html>
      `;

      try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'api-key': brevoApiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            sender: { name: 'DÉCADA OUSADA', email: 'noreply@dasprent.pt' },
            to: [{ email: s.email, name: s.driver_name }],
            subject: `Resumo Financeiro - ${s.driver_name} - ${s.periodo}`,
            htmlContent: htmlContent,
          }),
        });

        if (response.ok) {
          results.push({ email: s.email, success: true });
        } else {
          const err = await response.json();
          results.push({ email: s.email, success: false, error: err.message });
        }
      } catch (e: unknown) {
        results.push({
          email: s.email,
          success: false,
          error: e instanceof Error ? e.message : 'Falha no envio',
        });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    if (error instanceof AuthorizationError || error instanceof RequestBodyError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Erro inesperado' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
