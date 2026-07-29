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

      let q = supabase
        .from('notificacoes')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
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
