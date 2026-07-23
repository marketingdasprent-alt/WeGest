import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotificacoesContext } from '@/contexts/NotificacoesContext';
import { NotificationCenter, type NotificationFilter } from '@/components/ui/notification-center';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * Sino persistente no header, sempre visível (ao contrário do NotificacoesPopup,
 * que só aparece por alguns segundos por aviso). Usa o mesmo NotificacoesContext
 * (só activas/não-resolvidas) — não existe ainda uma query de histórico
 * paginado, por isso os separadores "Não resolvidas"/"Todas" mostram a mesma
 * lista por agora; `hasMore`/`onLoadMore` ficam sempre a false/no-op até essa
 * query existir.
 */
export function NotificationBell() {
  const { notificacoes, resolver, enabled } = useNotificacoesContext();

  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState<NotificationFilter>('unread');

  if (!enabled) return null;

  const unreadCount = notificacoes.length;

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
          notificacoes={notificacoes}
          isLoading={false}
          error={null}
          filtro={filtro}
          onFiltroChange={setFiltro}
          onMarkAsRead={resolver}
          onLoadMore={() => {}}
          hasMore={false}
          isLoadingMore={false}
          unreadCount={unreadCount}
        />
      </PopoverContent>
    </Popover>
  );
}
