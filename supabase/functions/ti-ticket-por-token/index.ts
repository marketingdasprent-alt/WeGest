// Leitura de UM ticket pelo token dele. verify_jwt = false: o autor não tem
// conta. O acesso_token é por ticket -- não confundir com ti_tokens.token, que
// só da direito a submeter. Se fossem o mesmo, quem tivesse o link de
// submissão lia os tickets de todos os colegas.
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import {
  consumeRateLimit,
  hashRateLimitIdentity,
  rateLimitResponse,
  trustedRequestIp,
} from '../_shared/rate-limit/rateLimit.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-client-info, apikey',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const { acesso_token } = await req.json();
    if (typeof acesso_token !== 'string' || !UUID.test(acesso_token)) {
      return json({ success: false, error: 'Link inválido.' }, 400);
    }

    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey);

    // A página do link vai buscar isto de 15 em 15 s (~240/h por separador
    // aberto); o tecto trava quem tente adivinhar tokens ou martelar a função.
    const limitada = rateLimitResponse(
      await consumeRateLimit(sb, {
        operation: 'ti-ticket-por-token',
        identity: await hashRateLimitIdentity(trustedRequestIp(req), serviceKey),
        limit: 900,
        windowSeconds: 3600,
      }),
      cors
    );
    if (limitada) return limitada;

    // Devolve o ticket deste token e SÓ este. O email do autor não volta para
    // fora: quem abre o link já o sabe, e não há razão para o expor.
    const { data: ticket, error: ticketError } = await sb
      .from('ti_tickets')
      .select(
        'id, numero, autor_nome, descricao, status, created_at, resolvido_por_nome, resolvido_em'
      )
      .eq('acesso_token', acesso_token)
      .maybeSingle();

    if (ticketError) {
      console.error('Erro ao buscar ticket:', ticketError);
      return json({ success: false, error: 'Não foi possível abrir o ticket.' }, 500);
    }

    if (!ticket) return json({ success: false, error: 'Ticket não encontrado.' }, 404);

    const [mensagens, anexos] = await Promise.all([
      sb
        .from('ti_ticket_mensagens')
        .select('id, autor_tipo, criado_por_nome, texto, created_at')
        .eq('ticket_id', ticket.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      sb
        .from('ti_ticket_anexos')
        .select('id, mensagem_id, nome, ficheiro_url, tamanho_bytes, mime_type, created_at')
        .eq('ticket_id', ticket.id)
        .order('created_at', { ascending: true }),
    ]);

    if (mensagens.error || anexos.error) {
      console.error('Erro ao buscar a conversa:', mensagens.error ?? anexos.error);
      return json({ success: false, error: 'Não foi possível abrir o ticket.' }, 500);
    }

    // Só os ficheiros da pasta deste pedido, e nunca os de mensagens apagadas:
    // a assinatura é com service role, por isso é aqui que se decide o que sai.
    const visiveis = new Set((mensagens.data ?? []).map((m) => m.id));
    const doPedido = (anexos.data ?? []).filter(
      (a) =>
        a.ficheiro_url.startsWith(`${ticket.id}/`) &&
        (!a.mensagem_id || visiveis.has(a.mensagem_id))
    );

    // Quem não tem conta não lê o bucket: os anexos seguem com URL assinada
    // de curta duração, e o caminho interno fica cá dentro.
    const caminhos = doPedido.map((a) => a.ficheiro_url);
    const assinados = caminhos.length
      ? await sb.storage.from('ti-ticket-anexos').createSignedUrls(caminhos, 60 * 10)
      : { data: [], error: null };
    if (assinados.error) console.error('Erro a assinar anexos:', assinados.error);
    const urlPorCaminho = new Map(
      (assinados.data ?? []).map((s) => [s.path, s.signedUrl] as [string | null, string])
    );

    const { id: _id, ...publico } = ticket;
    return json({
      success: true,
      ticket: publico,
      mensagens: mensagens.data ?? [],
      anexos: doPedido.map(({ ficheiro_url, ...a }) => ({
        ...a,
        url: urlPorCaminho.get(ficheiro_url) ?? null,
      })),
    });
  } catch (e) {
    console.error('ti-ticket-por-token:', e);
    return json({ success: false, error: 'Não foi possível abrir o ticket.' }, 500);
  }
});
