import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DESTINATARIO = 'marketing@dasprent.pt';

/**
 * Avisa marketing@dasprent.pt sempre que um cartão de combustível é
 * adicionado a um motorista. Chamada pelo trigger SQL
 * `trg_cartao_frota_email_aviso` via pg_net — o corpo traz já o nome/NIF
 * do motorista resolvidos (a função não faz DB lookups).
 */
interface CartaoFrotaRequest {
  motoristaNome?: string | null;
  motoristaNif?: string | null;
  tipo: string;
  numero: string;
  data: string; // ISO
}

const TIPO_LABEL: Record<string, string> = { bp: 'BP', repsol: 'Repsol', edp: 'EDP' };

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-PT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function corpoEmail(p: CartaoFrotaRequest): string {
  const tipoLabel = TIPO_LABEL[p.tipo] ?? p.tipo;
  const dataFmt = formatarData(p.data);
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
      <div style="background: #111827; padding: 24px; border-radius: 10px; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 22px;">Novo cartão de combustível</h1>
        <p style="color: #cbd5e1; margin: 6px 0 0;">WeGest</p>
      </div>
      <div style="background: #f9f9f9; padding: 24px; border-radius: 10px; margin-top: 16px;">
        <p>Informo que o cartão <strong>${tipoLabel} nº ${p.numero}</strong> está a ser adicionado ao
          motorista <strong>${p.motoristaNome || 'desconhecido'}</strong>${
            p.motoristaNif ? ` (NIF ${p.motoristaNif})` : ''
          } na data de ${dataFmt}.</p>
        <table style="width:100%; border-collapse: collapse; margin-top: 12px;">
          <tr><td style="padding:4px 0; color:#666;">Motorista</td><td style="padding:4px 0;"><strong>${p.motoristaNome || '—'}</strong></td></tr>
          <tr><td style="padding:4px 0; color:#666;">NIF</td><td style="padding:4px 0;">${p.motoristaNif || '—'}</td></tr>
          <tr><td style="padding:4px 0; color:#666;">Tipo</td><td style="padding:4px 0;">${tipoLabel}</td></tr>
          <tr><td style="padding:4px 0; color:#666;">Nº Cartão</td><td style="padding:4px 0;">${p.numero}</td></tr>
          <tr><td style="padding:4px 0; color:#666;">Data</td><td style="padding:4px 0;">${dataFmt}</td></tr>
        </table>
      </div>
      <p style="text-align:center;color:#666;font-size:13px;margin-top:16px;">
        Este é um email automático, não responda a esta mensagem.
      </p>
    </div>
  `;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
    if (!BREVO_API_KEY) throw new Error('BREVO_API_KEY não configurada');

    const p: CartaoFrotaRequest = await req.json();
    if (!p.tipo || !p.numero || !p.data) {
      return new Response(JSON.stringify({ error: 'tipo, numero e data são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tipoLabel = TIPO_LABEL[p.tipo] ?? p.tipo;
    const subject = `Novo cartão ${tipoLabel} adicionado — ${p.motoristaNome || 'motorista'}`;

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'WeGest', email: 'noreply@dasprent.pt' },
        to: [{ email: DESTINATARIO }],
        subject,
        htmlContent: corpoEmail(p),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Brevo: ${errText}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado';
    console.error('send-cartao-frota-email:', message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
