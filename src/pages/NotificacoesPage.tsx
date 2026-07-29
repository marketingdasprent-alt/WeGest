import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useMarkNotificationRead } from '@/hooks/useNotifications';
import { useNotificacoesHistorico } from '@/hooks/useNotificacoesHistorico';
import { NotificationCenter, type NotificationFilter } from '@/components/ui/notification-center';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';

const NotificacoesPage = () => {
  const [filtro, setFiltro] = useState<NotificationFilter>('unread');
  const apenasNaoResolvidas = filtro === 'unread';

  const markAsRead = useMarkNotificationRead();

  const { data, error, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useNotificacoesHistorico(apenasNaoResolvidas);

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
