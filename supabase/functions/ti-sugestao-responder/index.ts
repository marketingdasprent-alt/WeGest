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
  resolvido: { reabrir: 'nao_resolvido' },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// Valida formato básico de UUID v4
function isValidUUID(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const { acesso_token, sugestao_id, util } = await req.json();
    if (!acesso_token || !sugestao_id || typeof util !== 'boolean') {
      return json({ success: false, error: 'Pedido incompleto.' }, 400);
    }

    // Valida formato de UUID antes de ir à base de dados (Minor #3)
    if (!isValidUUID(acesso_token) || !isValidUUID(sugestao_id)) {
      return json({ success: false, error: 'Pedido incompleto.' }, 400);
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Remove org_id do select (Minor #4)
    const { data: ticket, error: ticketError } = await sb
      .from('ti_tickets')
      .select('id, status')
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

    // Compare-and-swap no UPDATE: .is('util', null) impede race condition onde dois
    // pedidos simultâneos (duplo clique, retry) ambos lêem util=null e ambos escrevem.
    // Assim, apenas um UPDATE afecta linhas; o outro acha que já foi respondido.
    // Nota: usamos .is() e não .eq() porque em Postgres, coluna = NULL nunca é verdadeiro
    // (lógica de três valores); .is() é o método correcto para comparar com NULL.
    const { data: updateSugestaoData, error: updateSugestaoError } = await sb
      .from('ti_ticket_sugestoes')
      .update({ util, respondida_em: new Date().toISOString() })
      .eq('id', sugestao.id)
      .is('util', null) // CRITICAL #1: compare-and-swap com .is() para NULL
      .select('id');

    if (updateSugestaoError) {
      console.error('Erro ao atualizar sugestão:', updateSugestaoError);
      throw updateSugestaoError;
    }

    // Se nenhuma linha foi afectada, outro pedido venceu a race condition
    if (!updateSugestaoData || updateSugestaoData.length === 0) {
      return json({ success: false, error: 'Já respondeu a esta sugestão.' }, 409);
    }

    const { error: updateTicketError } = await sb
      .from('ti_tickets')
      .update({ status: novo, updated_at: new Date().toISOString() })
      .eq('id', ticket.id);

    if (updateTicketError) {
      console.error('Erro ao atualizar ticket:', updateTicketError);
      // IMPORTANT #2: Mitiga falta de atomicidade. Se o ticket falhar, reverte a sugestão
      // para evitar que o utilizador fique preso num 409 permanente (já respondido)
      // sem culpa sua.
      const { error: revertError } = await sb
        .from('ti_ticket_sugestoes')
        .update({ util: null, respondida_em: null })
        .eq('id', sugestao.id);

      if (revertError) {
        console.error(
          'CRÍTICO: falha ao atualizar ticket E falha ao revert da sugestão. Dessincronização!',
          { updateTicketError, revertError }
        );
      }
      throw updateTicketError;
    }

    // Só quando a sugestão NÃO ajudou: é aí que o pedido regride para
    // `nao_resolvido` e alguém tem de voltar a olhar para ele. Quem responde é
    // o autor, não alguém que esteja a ver a lista — sem este aviso o pedido
    // ficava a apodrecer sem ninguém dar por ela.
    //
    // É o último passo e nunca faz falhar a resposta: o autor já respondeu, e
    // devolver-lhe erro por causa de um email seria dar-lhe um problema que
    // não é dele. O invoke devolve o erro em `error` em vez de o lançar, por
    // isso verifica-se o valor devolvido além do try/catch.
    if (!util) {
      try {
        const { error: emailError } = await sb.functions.invoke('ti-sugestao-nao-ajudou-email', {
          body: { ticket_id: ticket.id },
        });
        if (emailError) {
          console.error('ti-sugestao-responder: aviso ao suporte não saiu:', emailError);
        }
      } catch (emailError) {
        console.error('ti-sugestao-responder: aviso ao suporte não saiu:', emailError);
      }
    }

    return json({ success: true, status: novo });
  } catch (e) {
    console.error('ti-sugestao-responder:', e);
    return json({ success: false, error: 'Não foi possível registar a resposta.' }, 500);
  }
});
