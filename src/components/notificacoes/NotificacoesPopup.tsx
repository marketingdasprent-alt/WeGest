import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { useNotificacoes } from '@/hooks/useNotificacoes';
import { armNotificationSound } from '@/lib/notificationSound';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertTriangle, Bell, Eye, X } from 'lucide-react';

const CARGOS_NOTIFICAVEIS = ['Gestor TVDE', 'Administrador', 'Supervisor Gestor TVDE'];

// Abre a lista de candidaturas; com candidatura_id, abre logo o detalhe.
const candidaturaLink = (candidaturaId: string | null) =>
  candidaturaId
    ? `/motoristas/candidaturas?candidatura=${candidaturaId}`
    : '/motoristas/candidaturas';

export const NotificacoesPopup = () => {
  const { cargo, isAdmin, tipoUtilizador, loading } = usePermissions();
  const navigate = useNavigate();

  const enabled =
    !loading &&
    tipoUtilizador !== 'motorista' &&
    (isAdmin || (cargo != null && CARGOS_NOTIFICAVEIS.includes(cargo)));

  const { notificacoes, resolver } = useNotificacoes(enabled);

  // Desbloqueia o áudio no primeiro gesto do utilizador (autoplay policy),
  // para que o aviso urgente ao supervisor toque mesmo sem clique imediato.
  useEffect(() => {
    if (enabled) armNotificationSound();
  }, [enabled]);

  if (!enabled || notificacoes.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
      {notificacoes.map((n) => {
        const urgente = n.severidade === 'urgente';
        return (
          <div
            key={n.id}
            role="alert"
            className={cn(
              'pointer-events-auto rounded-xl border p-4 shadow-lg duration-300 animate-in slide-in-from-bottom-4 fade-in',
              urgente
                ? 'border-red-500 bg-red-50 dark:border-red-700 dark:bg-red-950/60 ring-2 ring-red-500/40'
                : 'border-border bg-card'
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  urgente
                    ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300'
                    : 'bg-primary/10 text-primary'
                )}
              >
                {urgente ? (
                  <AlertTriangle className="h-5 w-5" />
                ) : (
                  <Bell className="h-5 w-5" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-sm font-semibold',
                    urgente ? 'text-red-700 dark:text-red-300' : 'text-foreground'
                  )}
                >
                  {urgente ? '🔴 ' : ''}
                  {n.titulo}
                </p>
                {n.mensagem && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{n.mensagem}</p>
                )}

                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant={urgente ? 'destructive' : 'default'}
                    className="h-8"
                    onClick={() => navigate(candidaturaLink(n.candidatura_id))}
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    Ver candidatura
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => resolver(n.id)}
                  >
                    Fechar
                  </Button>
                </div>
              </div>

              <button
                type="button"
                aria-label="Fechar"
                onClick={() => resolver(n.id)}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
