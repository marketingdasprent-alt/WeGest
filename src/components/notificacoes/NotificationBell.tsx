import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotificacoesContext } from '@/contexts/NotificacoesContext';
import { useNotificacoesHistorico } from '@/hooks/useNotificacoesHistorico';
import { useMarkNotificationRead } from '@/hooks/useNotifications';
import { NotificationCenter, type NotificationFilter } from '@/components/ui/notification-center';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * Sino persistente no header, sempre visível (ao contrário do NotificacoesPopup,
 * que só aparece por alguns segundos por aviso). "Não resolvidas" usa o
 * NotificacoesContext (realtime, instantâneo). "Todas" usa uma query à parte
 * (useNotificacoesHistorico) que inclui resolvidas — sem ela, uma notificação
 * resolvida ficava impossível de encontrar em qualquer separador. Só corre
 * quando o popover está aberto E o separador "Todas" está seleccionado.
 */
export function NotificationBell() {
  const { notificacoes, resolver, enabled } = useNotificacoesContext();

  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState<NotificationFilter>('unread');
  const mostrarTodas = filtro === 'all';

  const historico = useNotificacoesHistorico(false, open && mostrarTodas);
  const markAsRead = useMarkNotificationRead();

  if (!enabled) return null;

  // O badge conta TIPOS distintos, não linhas — porque é isso que a lista mostra:
  // o NotificationCenter agrupa por título. Contar linhas dizia "33" e abria 11
  // grupos; o número tem de descrever o que o utilizador encontra lá dentro.
  const unreadCount = new Set(notificacoes.map((n) => n.titulo)).size;
  const notificacoesHistorico = historico.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-h-[70vh] overflow-y-auto p-3">
        <NotificationCenter
          notificacoes={mostrarTodas ? notificacoesHistorico : notificacoes}
          isLoading={mostrarTodas && historico.isLoading}
          error={mostrarTodas ? (historico.error as Error | null) : null}
          filtro={filtro}
          onFiltroChange={setFiltro}
          onMarkAsRead={mostrarTodas ? (id) => markAsRead.mutate(id) : resolver}
          onLoadMore={() => historico.fetchNextPage()}
          hasMore={mostrarTodas && !!historico.hasNextPage}
          isLoadingMore={historico.isFetchingNextPage}
          unreadCount={unreadCount}
        />
      </PopoverContent>
    </Popover>
  );
}
