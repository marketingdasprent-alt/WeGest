// Resposta do autor a uma sugestão: ajudou ou não. verify_jwt = false, o autor
// não tem conta; a autorização é o acesso_token do ticket.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization, x-client-info, apikey',
};

// Espelha src/lib/tiTicketEstados.ts. O teste tiTicketEstados.espelho.test.ts
// compara as duas tabelas e falha se divergirem.
const TRANSICOES: Record<string, Record<string, string>> = {
  aberto: { sugerir: 'com_sugestao', marcar_presencial: 'presencial', fechar: 'resolvido' },
  com_sugestao: {
    foi_util: 'resolvido',
    nao_ajudou: 'nao_resolvido',
    marcar_presencial: 'presencial',
    fechar: 'resolvido',
  },
  nao_resolvido: { sugerir: 'com_sugestao', marcar_presencial: 'presencial', fechar: 'resolvido' },
  presencial: { sugerir: 'com_sugestao', fechar: 'resolvido' },
  resolvido: {},
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
    const { acesso_token, sugestao_id, util } = await req.json();
    if (!acesso_token || !sugestao_id || typeof util !== 'boolean') {
      return json({ success: false, error: 'Pedido incompleto.' }, 400);
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: ticket, error: ticketError } = await sb
      .from('ti_tickets')
      .select('id, status, org_id')
      .eq('acesso_token', acesso_token)
      .maybeSingle();

    if (ticketError) {
      console.error('Erro ao buscar ticket:', ticketError);
      return json({ success: false, error: 'Não foi possível abrir o ticket.' }, 500);
    }

    if (!ticket) return json({ success: false, error: 'Ticket não encontrado.' }, 404);

    // A sugestão tem de ser deste ticket. Sem esta verificação, um acesso_token
    // válido poderia responder a sugestões de outro ticket.
    const { data: sugestao, error: sugestaoError } = await sb
      .from('ti_ticket_sugestoes')
      .select('id, util')
      .eq('id', sugestao_id)
      .eq('ticket_id', ticket.id)
      .maybeSingle();

    if (sugestaoError) {
      console.error('Erro ao buscar sugestão:', sugestaoError);
      return json({ success: false, error: 'Não foi possível registar a resposta.' }, 500);
    }

    if (!sugestao) return json({ success: false, error: 'Sugestão não encontrada.' }, 404);
    if (sugestao.util !== null) {
      return json({ success: false, error: 'Já respondeu a esta sugestão.' }, 409);
    }

    const evento = util ? 'foi_util' : 'nao_ajudou';
    const novo = TRANSICOES[ticket.status]?.[evento] ?? null;
    if (!novo) {
      return json({ success: false, error: 'Este ticket já não aceita resposta.' }, 409);
    }

    const { error: updateSugestaoError } = await sb
      .from('ti_ticket_sugestoes')
      .update({ util, respondida_em: new Date().toISOString() })
      .eq('id', sugestao.id);

    if (updateSugestaoError) {
      console.error('Erro ao atualizar sugestão:', updateSugestaoError);
      throw updateSugestaoError;
    }

    const { error: updateTicketError } = await sb
      .from('ti_tickets')
      .update({ status: novo, updated_at: new Date().toISOString() })
      .eq('id', ticket.id);

    if (updateTicketError) {
      console.error('Erro ao atualizar ticket:', updateTicketError);
      throw updateTicketError;
    }

    return json({ success: true, status: novo });
  } catch (e) {
    console.error('ti-sugestao-responder:', e);
    return json({ success: false, error: 'Não foi possível registar a resposta.' }, 500);
  }
});
