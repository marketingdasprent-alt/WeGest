// Leitura de UM ticket pelo token dele. verify_jwt = false: o autor não tem
// conta. O acesso_token é por ticket -- não confundir com ti_tokens.token, que
// só da direito a submeter. Se fossem o mesmo, quem tivesse o link de
// submissão lia os tickets de todos os colegas.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const { acesso_token } = await req.json();
    if (!acesso_token) return json({ success: false, error: 'Link inválido.' }, 400);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Devolve o ticket deste token e SÓ este. O email do autor não volta para
    // fora: quem abre o link já o sabe, e não há razão para o expor.
    const { data: ticket, error: ticketError } = await sb
      .from('ti_tickets')
      .select('id, numero, autor_nome, descricao, status, created_at')
      .eq('acesso_token', acesso_token)
      .maybeSingle();

    if (ticketError) {
      console.error('Erro ao buscar ticket:', ticketError);
      return json({ success: false, error: 'Não foi possível abrir o ticket.' }, 500);
    }

    if (!ticket) return json({ success: false, error: 'Ticket não encontrado.' }, 404);

    const { data: sugestoes, error: sugestoesError } = await sb
      .from('ti_ticket_sugestoes')
      .select('id, texto, util, resposta_texto, created_at')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true });

    if (sugestoesError) {
      console.error('Erro ao buscar sugestões:', sugestoesError);
      return json({ success: false, error: 'Não foi possível abrir o ticket.' }, 500);
    }

    const { id: _id, ...publico } = ticket;
    return json({ success: true, ticket: publico, sugestoes: sugestoes ?? [] });
  } catch (e) {
    console.error('ti-ticket-por-token:', e);
    return json({ success: false, error: 'Não foi possível abrir o ticket.' }, 500);
  }
});
