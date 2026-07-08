import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Avisa por email o motorista (e o gestor responsável) de que um recibo foi
 * anulado. Chamada pelo trigger SQL `trg_recibo_anulado_avisos` via pg_net —
 * o corpo traz já os emails e nomes resolvidos (a função não faz DB lookups).
 */
interface ReciboAnuladoRequest {
  reciboCodigo: string | number;
  valor?: number | null;
  motivo?: string | null;
  motoristaEmail?: string | null;
  motoristaNome?: string | null;
  gestorEmail?: string | null;
  gestorNome?: string | null;
}

const fmtEur = (v: number | null | undefined): string =>
  v == null ? '' : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v);

function emailMotorista(p: ReciboAnuladoRequest): string {
  const valor = fmtEur(p.valor);
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
      <div style="background: #111827; padding: 24px; border-radius: 10px; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 22px;">Recibo anulado</h1>
        <p style="color: #cbd5e1; margin: 6px 0 0;">WeGest</p>
      </div>
      <div style="background: #f9f9f9; padding: 24px; border-radius: 10px; margin-top: 16px;">
        <p>Olá${p.motoristaNome ? ' ' + p.motoristaNome : ''},</p>
        <p>Informamos que o recibo <strong>nº ${p.reciboCodigo}</strong>${
          valor ? ` (${valor})` : ''
        } foi <strong>anulado</strong>.</p>
        ${
          p.motivo
            ? `<p style="background:#e9ecef;padding:12px 16px;border-radius:6px;"><strong>Motivo:</strong> ${p.motivo}</p>`
            : ''
        }
        <p>Se tiver dúvidas, contacte o seu gestor.</p>
      </div>
      <p style="text-align:center;color:#666;font-size:13px;margin-top:16px;">
        Este é um email automático, não responda a esta mensagem.
      </p>
    </div>
  `;
}

function emailGestor(p: ReciboAnuladoRequest): string {
  const valor = fmtEur(p.valor);
  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
      <div style="background: #111827; padding: 24px; border-radius: 10px; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 22px;">Recibo anulado</h1>
        <p style="color: #cbd5e1; margin: 6px 0 0;">WeGest</p>
      </div>
      <div style="background: #f9f9f9; padding: 24px; border-radius: 10px; margin-top: 16px;">
        <p>Olá${p.gestorNome ? ' ' + p.gestorNome : ''},</p>
        <p>O recibo <strong>nº ${p.reciboCodigo}</strong>${valor ? ` (${valor})` : ''} do motorista
          <strong>${p.motoristaNome || 'desconhecido'}</strong> foi anulado.</p>
        ${p.motivo ? `<p><strong>Motivo:</strong> ${p.motivo}</p>` : ''}
        <p>O motorista foi notificado por email.</p>
      </div>
      <p style="text-align:center;color:#666;font-size:13px;margin-top:16px;">
        Este é um email automático, não responda a esta mensagem.
      </p>
    </div>
  `;
}

async function enviarBrevo(
  apiKey: string,
  to: string,
  toNome: string | null | undefined,
  subject: string,
  htmlContent: string
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'WeGest', email: 'noreply@dasprent.pt' },
      to: [{ email: to, name: toNome || to.split('@')[0] }],
      subject,
      htmlContent,
    }),
  });
  if (!res.ok) {
    return { ok: false, error: await res.text() };
  }
  return { ok: true };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
    if (!BREVO_API_KEY) throw new Error('BREVO_API_KEY não configurada');

    const p: ReciboAnuladoRequest = await req.json();
    if (!p.reciboCodigo) {
      return new Response(JSON.stringify({ error: 'reciboCodigo é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const subject = `Recibo nº ${p.reciboCodigo} anulado`;
    // Envia a cada destinatário disponível de forma verdadeiramente
    // independente: allSettled garante que uma falha de rede num envio (fetch
    // rejeitado) não impede o outro. Cada enviarBrevo já trata respostas não-2xx
    // devolvendo {ok:false}; aqui cobrimos também as rejeições de transporte.
    const envios: Array<Promise<{ alvo: string; res: { ok: boolean; error?: string } }>> = [];
    if (p.motoristaEmail) {
      envios.push(
        enviarBrevo(
          BREVO_API_KEY,
          p.motoristaEmail,
          p.motoristaNome,
          subject,
          emailMotorista(p)
        ).then((res) => ({ alvo: 'motorista', res }))
      );
    }
    if (p.gestorEmail) {
      envios.push(
        enviarBrevo(BREVO_API_KEY, p.gestorEmail, p.gestorNome, subject, emailGestor(p)).then(
          (res) => ({ alvo: 'gestor', res })
        )
      );
    }

    const settled = await Promise.allSettled(envios);
    const resultados: Record<string, unknown> = {};
    settled.forEach((s, i) => {
      if (s.status === 'fulfilled') {
        resultados[s.value.alvo] = s.value.res;
      } else {
        resultados[`envio_${i}`] = { ok: false, error: String(s.reason) };
      }
    });

    return new Response(JSON.stringify({ success: true, resultados }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado';
    console.error('send-recibo-anulado-email:', message);
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
