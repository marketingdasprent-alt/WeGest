// Avisa o suporte de que o autor respondeu que a sugestão NÃO ajudou — ou
// seja, que o pedido regrediu e volta a precisar de atenção. Sem isto, um
// pedido podia ficar em `nao_resolvido` sem ninguém dar por ela: quem responde
// é o autor, não alguém que esteja a olhar para a lista.
//
// Exige JWT. Quem chama é o ti-sugestao-responder com a chave service_role,
// que já é um JWT assinado pelo projecto. O autor anónimo não fala com esta
// função directamente.
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

/** Só domínios da plataforma (e localhost). Mesma regra do ti-ticket-sugestao-email. */
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
      console.error('ti-sugestao-nao-ajudou-email: falha a ler o pedido:', ticketError);
      return json({ success: false, error: 'Não foi possível abrir o pedido.' }, 500);
    }

    if (!t) return json({ success: false, error: 'Pedido não encontrado.' }, 404);

    // O destinatário vem sempre da organização DO PEDIDO, nunca de quem chamou.
    const { data: org, error: orgError } = await sb
      .from('organizacoes')
      .select('email_suporte')
      .eq('id', t.org_id)
      .maybeSingle();

    if (orgError) {
      console.error('ti-sugestao-nao-ajudou-email: falha a ler a organização:', orgError);
      return json({ success: false, error: 'Não foi possível obter o email de suporte.' }, 500);
    }

    // Sem email de suporte configurado não se avisa ninguém, e isso não é erro:
    // é a organização a dizer que não quer o aviso.
    const destino = org?.email_suporte?.trim();
    if (!destino) return json({ success: true, enviado: false });

    // O link é para o ADMIN, por isso vai para a origem da APLICAÇÃO — nunca
    // para o domínio público dos pedidos. A lista só aparece a quem tem sessão,
    // e a sessão vive em localStorage, que é por origem: mandar o admin para
    // tickets.wegest.pt levava-o para onde ele é anónimo, e a lista não abria.
    // Foi exactamente esse o bug de 2026-08-18.
    const base = baseValida(Deno.env.get('APP_URL'));
    let link: string | null = null;
    if (base) {
      const { data: tk } = await sb
        .from('ti_tokens')
        .select('token')
        .eq('org_id', t.org_id)
        .eq('ativo', true)
        .limit(1)
        .maybeSingle();
      if (tk?.token) link = `${base}/ti/${tk.token}`;
    }

    // Sem link válido envia-se na mesma, só sem botão: o que interessa é o
    // suporte saber que o pedido regrediu. Falhar o aviso inteiro por causa de
    // uma variável mal configurada seria trocar o problema pequeno pelo grande.
    if (!link) {
      console.error('ti-sugestao-nao-ajudou-email: sem APP_URL válido, aviso segue sem link');
    }

    const html = `
      <p>O autor respondeu que a sugestão <strong>não ajudou</strong>. O pedido voltou a precisar de atenção.</p>
      <p><strong>#${t.numero}</strong> — ${escapeHtml(t.autor_nome)} (${escapeHtml(t.autor_email)})</p>
      <blockquote>${escapeHtml(t.descricao)}</blockquote>
      ${link ? `<p><a href="${link}">Abrir os pedidos</a></p>` : ''}
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
        subject: `Pedido #${t.numero} — a sugestão não resolveu`,
        htmlContent: html,
      }),
    });

    if (!resposta.ok) throw new Error(`Brevo ${resposta.status}: ${await resposta.text()}`);

    return json({ success: true, enviado: true });
  } catch (e) {
    console.error('ti-sugestao-nao-ajudou-email:', e);
    return json({ success: false, error: String(e) }, 500);
  }
});
