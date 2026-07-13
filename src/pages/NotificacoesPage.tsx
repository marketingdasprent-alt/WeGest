import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { useMarkNotificationRead } from '@/hooks/useNotifications';
import { NotificationCenter, type NotificationFilter } from '@/components/ui/notification-center';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';

type Notificacao = Tables<'notificacoes'>;

const PAGE_SIZE = 20;

interface NotificacoesPageData {
  data: Notificacao[];
  total: number;
  totalPages: number;
  page: number;
}

const NotificacoesPage = () => {
  const [filtro, setFiltro] = useState<NotificationFilter>('unread');
  const apenasNaoResolvidas = filtro === 'unread';

  const markAsRead = useMarkNotificationRead();

  const {
    data,
    error,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<NotificacoesPageData>({
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

      const { data: rows, error: queryError, count } = await q;
      if (queryError) throw queryError;

      return {
        data: (rows ?? []) as Notificacao[],
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / PAGE_SIZE),
        page,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    staleTime: 30_000,
  });

  const notificacoes = data?.pages.flatMap((p) => p.data) ?? [];
  const totalUnread = data?.pages[0]?.total ?? 0;

  return (
    <>
      <StickyPageHeader
        title="Notificações"
        description="Avisos de motoristas pendentes, escalonamentos, viaturas disponíveis e pedidos de troca."
        icon={Bell}
      />
      <NotificationCenter
        notificacoes={notificacoes}
        isLoading={isLoading}
        error={error}
        filtro={filtro}
        onFiltroChange={setFiltro}
        onMarkAsRead={(id) => markAsRead.mutate(id)}
        onLoadMore={() => fetchNextPage()}
        hasMore={!!hasNextPage}
        isLoadingMore={isFetchingNextPage}
        unreadCount={apenasNaoResolvidas ? totalUnread : 0}
      />
    </>
  );
};

export default NotificacoesPage;
