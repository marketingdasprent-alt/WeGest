// Envia ao autor do ticket o link para ver a sugestão. Exige JWT: é sempre a
// app autenticada (o admin) que dispara, nunca o público.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-client-info, apikey',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** Escape de caracteres especiais para HTML: &, <, >, ", '. Ordem crítica: & em primeiro. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Base do link que vai no email.
 *
 * NÃO se usa um domínio fixo: este produto é multi-tenant e cada organização
 * corre no seu próprio domínio (decada-ousada.lovable.app,
 * marketingdasprent-alt.lovable.app, ...). Um valor fixo no código serve uma
 * organização e manda todas as outras para o sítio errado — e a primeira versão
 * disto apontava para `app.wegest.pt`, que nem existe.
 *
 * Por isso a app envia a sua própria origem. Como quem dispara é um admin
 * autenticado, o valor tem de ser validado: sem isto, um admin podia fazer o
 * email apontar para um site à escolha dele e usá-lo para phishing com a nossa
 * assinatura. Só passam os domínios da plataforma (e localhost, para
 * desenvolvimento).
 */
function baseValida(origem: unknown): string | null {
  if (typeof origem !== 'string' || origem.length > 200) return null;
  let u: URL;
  try {
    u = new URL(origem);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  const localDev = u.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1');
  const plataforma =
    u.protocol === 'https:' &&
    (host.endsWith('.lovable.app') || host === 'wegest.pt' || host.endsWith('.wegest.pt'));
  if (!localDev && !plataforma) return null;
  return u.origin;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const { ticket_id, origem } = await req.json();
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: t, error: ticketError } = await sb
      .from('ti_tickets')
      .select('numero, autor_nome, autor_email, acesso_token')
      .eq('id', ticket_id)
      .maybeSingle();

    if (ticketError) {
      console.error('Erro ao buscar ticket:', ticketError);
      return json({ success: false, error: 'Não foi possível abrir o ticket.' }, 500);
    }

    if (!t) {
      return json({ success: false, error: 'Ticket não encontrado.' }, 404);
    }

    const { data: sug, error: sugError } = await sb
      .from('ti_ticket_sugestoes')
      .select('texto')
      .eq('ticket_id', ticket_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sugError) {
      console.error('Erro ao buscar sugestão:', sugError);
      return json({ success: false, error: 'Não foi possível obter a sugestão.' }, 500);
    }

    // Preferência: a origem que a app enviou (validada). Em alternativa, um
    // APP_URL configurado. Se nenhuma servir, NÃO se envia um email com um link
    // roto — falha-se de forma visível para o admin poder avisar a pessoa por
    // outra via, em vez de a mandar clicar em nada.
    const base = baseValida(origem) ?? baseValida(Deno.env.get('APP_URL'));
    if (!base) {
      console.error('ti-ticket-sugestao-email: sem origem válida', { origem });
      return json({ success: false, error: 'Não foi possível construir o link do pedido.' }, 400);
    }
    const link = `${base}/ti/ticket/${t.acesso_token}`;

    const html = `
      <p>Olá ${escapeHtml(t.autor_nome)},</p>
      <p>O seu pedido <strong>#${t.numero}</strong> tem uma sugestão de resolução:</p>
      <blockquote>${escapeHtml(sug?.texto ?? '')}</blockquote>
      <p><a href="${link}">Abrir o pedido e dizer se ajudou</a></p>
    `;

    const resposta = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': Deno.env.get('BREVO_API_KEY')!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'WeGest', email: Deno.env.get('BREVO_SENDER') ?? 'no-reply@wegest.pt' },
        to: [{ email: t.autor_email, name: t.autor_nome }],
        subject: `Pedido #${t.numero} — sugestão de resolução`,
        htmlContent: html,
      }),
    });

    if (!resposta.ok) throw new Error(`Brevo ${resposta.status}: ${await resposta.text()}`);

    return json({ success: true });
  } catch (e) {
    console.error('ti-ticket-sugestao-email:', e);
    return json({ success: false, error: String(e) }, 500);
  }
});
