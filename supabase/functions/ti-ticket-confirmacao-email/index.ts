// Confirmação a quem pediu, com o link da conversa. É o único email do chat:
// quem não tem conta não tem outra forma de voltar ao pedido. Exige JWT — quem
// chama é o ti-ticket-submeter, com a service role.
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { isInternalRequest } from '../_shared/auth/edgeAuthorization.ts';
import { baseValida } from '../_shared/ti-tickets/mensagem.ts';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  // Só o ti-ticket-submeter: um JWT de utilizador qualquer chegava para mandar
  // emails repetidos a quem pediu.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!isInternalRequest(req, serviceKey)) {
    return json({ success: false, error: 'Chamada interna não autorizada' }, 401);
  }

  try {
    const { ticket_id, origem } = await req.json();
    if (!ticket_id) return json({ success: false, error: 'Pedido não indicado.' }, 400);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

    const { data: t, error: ticketError } = await sb
      .from('ti_tickets')
      .select('numero, autor_email, acesso_token')
      .eq('id', ticket_id)
      .maybeSingle();

    if (ticketError) {
      console.error('ti-ticket-confirmacao-email: falha a ler o pedido:', ticketError);
      return json({ success: false, error: 'Não foi possível abrir o pedido.' }, 500);
    }
    if (!t) return json({ success: false, error: 'Pedido não encontrado.' }, 404);

    // A origem configurada no servidor não pode ser controlada pelo chamador.
    const base =
      baseValida(Deno.env.get('TICKETS_BASE_URL')) ??
      baseValida(origem) ??
      baseValida(Deno.env.get('APP_URL'));
    if (!base) {
      console.error('ti-ticket-confirmacao-email: sem origem válida', { origem });
      return json({ success: false, error: 'Não foi possível construir o link do pedido.' }, 400);
    }
    const link = `${base}/ti/ticket/${t.acesso_token}`;

    // Sem nada escrito por quem submeteu (nome, descrição): o formulário é
    // público e o destinatário não é verificado, e um texto livre num email com
    // o nosso remetente servia de phishing. Só o número e o link para cá.
    const html = `
      <p>Olá,</p>
      <p>Recebemos o pedido de informática <strong>#${t.numero}</strong> feito com este email.</p>
      <p>É neste link que o suporte responde e onde pode continuar a conversa:</p>
      <p><a href="${link}">Abrir o pedido #${t.numero}</a></p>
      <p style="color:#666;font-size:12px">Guarde este email: não enviamos outro por cada mensagem.
      Se não fez este pedido, ignore-o.</p>
    `;

    const resposta = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': Deno.env.get('BREVO_API_KEY')!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'WeGest', email: Deno.env.get('BREVO_SENDER') ?? 'no-reply@wegest.pt' },
        to: [{ email: t.autor_email }],
        subject: `Pedido #${t.numero} recebido`,
        htmlContent: html,
      }),
    });

    if (!resposta.ok) throw new Error(`Brevo ${resposta.status}: ${await resposta.text()}`);

    return json({ success: true });
  } catch (e) {
    console.error('ti-ticket-confirmacao-email:', e);
    return json({ success: false, error: 'Não foi possível enviar a confirmação.' }, 500);
  }
});
