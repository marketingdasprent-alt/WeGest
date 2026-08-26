import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type Notificacao = Tables<'notificacoes'>;

const PAGE_SIZE = 20;

interface NotificacoesHistoricoPage {
  data: Notificacao[];
  total: number;
  totalPages: number;
  page: number;
}

/**
 * Histórico paginado de notificações (resolvidas + não resolvidas) — ao
 * contrário de useNotificacoes (NotificacoesContext), que só mantém as
 * activas em memória via realtime. É o que dá conteúdo real ao separador
 * "Todas": sem esta query, "Todas" mostrava a mesma lista de activas que
 * "Não resolvidas", e uma notificação resolvida (ou dispensada) deixava de
 * ser possível encontrar em qualquer sítio.
 */
export function useNotificacoesHistorico(apenasNaoResolvidas: boolean, enabled = true) {
  return useInfiniteQuery<NotificacoesHistoricoPage>({
    queryKey: ['notificacoes', 'infinite', { apenasNaoResolvidas }],
    queryFn: async ({ pageParam }) => {
      const page = (pageParam as number) ?? 1;
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // O desempate por `id` NÃO é cosmético.
      //
      // execute_automation_runs() insere dezenas de linhas na mesma
      // transacção, e `now()` em Postgres devolve o MESMO instante para toda
      // a transacção — todas essas linhas ficam com `created_at` idêntico.
      // Com um único critério de ordenação, a ordem entre empates é
      // indefinida e o planeador pode devolvê-la diferente entre queries:
      // a página 2 repetia linhas da página 1 e saltava outras, sem erro
      // nenhum. Num produto onde a lista é a prova de que um aviso foi
      // mostrado, saltar linhas em silêncio é o pior resultado possível.
      let q = supabase
        .from('notificacoes')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, to);

      if (apenasNaoResolvidas) {
        q = q.eq('resolvida', false);
      }

      const { data, error, count } = await q;
      if (error) throw error;

      return {
        data: (data ?? []) as Notificacao[],
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
        page,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    staleTime: 30_000,
    enabled,
  });
}
