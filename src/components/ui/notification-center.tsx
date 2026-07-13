import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import {
  AlertTriangle,
  Bell,
  Check,
  ChevronRight,
  Eye,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';
import { notificacaoLabel, notificacaoLink } from '@/utils/notificacoes';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

type Notificacao = Tables<'notificacoes'>;

export type NotificationFilter = 'all' | 'unread';

export interface NotificationCenterProps {
  notificacoes: Notificacao[];
  isLoading: boolean;
  error: Error | null;
  filtro: NotificationFilter;
  onFiltroChange: (filtro: NotificationFilter) => void;
  onMarkAsRead: (id: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  unreadCount?: number;
}

// ── Severity config ──────────────────────────────────────────────────────────

interface SeveridadeConfig {
  icon: LucideIcon;
  iconClass: string;
  bgClass: string;
}

const SEVERIDADE_MAP: Record<string, SeveridadeConfig> = {
  urgente: {
    icon: AlertTriangle,
    iconClass: 'text-red-500',
    bgClass: 'hover:bg-red-500/5',
  },
  normal: {
    icon: Bell,
    iconClass: 'text-primary',
    bgClass: 'hover:bg-primary/5',
  },
};

const getSeveridadeConfig = (severidade: string): SeveridadeConfig =>
  SEVERIDADE_MAP[severidade] ?? SEVERIDADE_MAP.normal;

// ── Component ────────────────────────────────────────────────────────────────

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  notificacoes,
  isLoading,
  error,
  filtro,
  onFiltroChange,
  onMarkAsRead,
  onLoadMore,
  hasMore,
  isLoadingMore,
  unreadCount = 0,
}) => {
  const navigate = useNavigate();

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertTriangle className="mb-3 h-10 w-10 text-destructive" />
        <p className="text-sm font-medium text-destructive">Erro ao carregar notificações</p>
        <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Filter tabs ── */}
      <Tabs value={filtro} onValueChange={(v) => onFiltroChange(v as NotificationFilter)}>
        <TabsList>
          <TabsTrigger value="unread" className="gap-1.5">
            Não resolvidas
            {unreadCount > 0 && (
              <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">Todas</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* ── Empty state ── */}
      {notificacoes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Bell className="mb-3 h-10 w-10 opacity-20" />
          <p className="text-sm font-medium">Sem notificações</p>
          <p className="mt-0.5 text-xs">
            {filtro === 'unread'
              ? 'Não há notificações por resolver.'
              : 'Não há notificações para mostrar.'}
          </p>
        </div>
      ) : (
        <>
          {/* ── Notification list ── */}
          <div className="space-y-2">
            {notificacoes.map((n) => {
              const sev = getSeveridadeConfig(n.severidade);
              const SevIcon = sev.icon;
              const urgente = n.severidade === 'urgente';
              const link = notificacaoLink(n);

              return (
                <div
                  key={n.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border border-border p-3 transition-colors',
                    sev.bgClass
                  )}
                >
                  {/* Severity icon */}
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                      urgente
                        ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300'
                        : 'bg-primary/10 text-primary'
                    )}
                  >
                    <SevIcon className="h-4 w-4" />
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={cn(
                          'text-sm font-semibold',
                          urgente ? 'text-red-700 dark:text-red-300' : 'text-foreground'
                        )}
                      >
                        {urgente && '🔴 '}
                        {n.titulo}
                      </p>
                      <time className="shrink-0 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(n.created_at), {
                          addSuffix: true,
                          locale: pt,
                        })}
                      </time>
                    </div>

                    {n.mensagem && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{n.mensagem}</p>
                    )}

                    {/* Actions */}
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={urgente ? 'destructive' : 'default'}
                        className="h-7"
                        onClick={() => navigate(link)}
                      >
                        <Eye className="mr-1 h-3 w-3" />
                        {notificacaoLabel(n)}
                      </Button>
                      {!n.resolvida && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7"
                          onClick={() => onMarkAsRead(n.id)}
                        >
                          <Check className="mr-1 h-3 w-3" />
                          Resolver
                        </Button>
                      )}
                      {n.resolvida && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Check className="h-3 w-3" />
                          Resolvida
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Navigate chevron */}
                  <button
                    type="button"
                    aria-label="Abrir"
                    onClick={() => navigate(link)}
                    className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* ── Load more ── */}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" onClick={onLoadMore} disabled={isLoadingMore}>
                {isLoadingMore ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />A carregar...
                  </>
                ) : (
                  'Carregar mais'
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
