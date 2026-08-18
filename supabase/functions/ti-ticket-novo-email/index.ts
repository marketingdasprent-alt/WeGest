// Avisa o email de suporte da organização de que entrou um pedido de
// informática novo. Os dois caminhos que criam pedidos chamam esta mesma
// função — o formulário público (via ti-ticket-submeter, com a service role) e
// o botão "Novo pedido" da aplicação (com a sessão do admin) — para o aviso não
// ficar escrito em dois sítios que depois divergem.
//
// Exige JWT: ambas as chamadas trazem uma (a service role já é um JWT assinado
// pelo projecto). O caminho anónimo não fala com esta função directamente.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const { ticket_id } = await req.json();
    if (!ticket_id) return json({ success: false, error: 'Pedido não indicado.' }, 400);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: t, error: ticketError } = await sb
      .from('ti_tickets')
      .select('numero, autor_nome, autor_email, descricao, org_id')
      .eq('id', ticket_id)
      .maybeSingle();

    if (ticketError) {
      console.error('ti-ticket-novo-email: falha a ler o pedido:', ticketError);
      return json({ success: false, error: 'Não foi possível abrir o pedido.' }, 500);
    }

    if (!t) return json({ success: false, error: 'Pedido não encontrado.' }, 404);

    // O destinatário vem sempre da organização DO PEDIDO, nunca de quem chamou:
    // é o que garante que um pedido de uma organização não pode ser encaminhado
    // para a caixa de outra.
    const { data: org, error: orgError } = await sb
      .from('organizacoes')
      .select('email_suporte')
      .eq('id', t.org_id)
      .maybeSingle();

    if (orgError) {
      console.error('ti-ticket-novo-email: falha a ler a organização:', orgError);
      return json({ success: false, error: 'Não foi possível obter o email de suporte.' }, 500);
    }

    // Sem email de suporte configurado não se avisa ninguém — e isso NÃO é um
    // erro: é a organização a dizer que não quer o aviso. Devolver falha aqui
    // punha quem chamou a avisar o utilizador de um problema que não existe.
    const destino = org?.email_suporte?.trim();
    if (!destino) return json({ success: true, enviado: false });

    const html = `
      <p>Foi aberto um novo pedido de informática.</p>
      <p><strong>#${t.numero}</strong> — ${escapeHtml(t.autor_nome)} (${escapeHtml(t.autor_email)})</p>
      <blockquote>${escapeHtml(t.descricao)}</blockquote>
    `;

    const resposta = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': Deno.env.get('BREVO_API_KEY')!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'WeGest', email: Deno.env.get('BREVO_SENDER') ?? 'no-reply@wegest.pt' },
        to: [{ email: destino }],
        subject: `Novo pedido de informática #${t.numero}`,
        htmlContent: html,
      }),
    });

    if (!resposta.ok) throw new Error(`Brevo ${resposta.status}: ${await resposta.text()}`);

    return json({ success: true, enviado: true });
  } catch (e) {
    console.error('ti-ticket-novo-email:', e);
    return json({ success: false, error: String(e) }, 500);
  }
});
