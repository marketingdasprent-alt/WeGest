import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificacoesContext } from '@/contexts/NotificacoesContext';
import { armNotificationSound } from '@/lib/notificationSound';
import { notificacaoLink, notificacaoLabel, notificacaoTitulo } from '@/utils/notificacoes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertTriangle, Bell, ChevronRight, Eye, EyeOff, List, X } from 'lucide-react';

const MAX_CARTOES = 3;

const AUTO_DISPENSA_MS = 10_000;

export const NotificacoesPopup = () => {
  const navigate = useNavigate();

  const { chegadas, dispensarChegada, enabled } = useNotificacoesContext();

  const temporizadores = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    for (const n of chegadas) {
      if (n.severidade === 'urgente') continue;
      if (temporizadores.current.has(n.id)) continue;

      const id = window.setTimeout(() => {
        temporizadores.current.delete(n.id);
        dispensarChegada(n.id);
      }, AUTO_DISPENSA_MS);
      temporizadores.current.set(n.id, id);
    }
  }, [chegadas, dispensarChegada]);

  useEffect(() => {
    const pendentes = temporizadores.current;
    return () => {
      pendentes.forEach((id) => window.clearTimeout(id));
      pendentes.clear();
    };
  }, []);

  useEffect(() => {
    if (enabled) armNotificationSound();
  }, [enabled]);

  if (!enabled) return null;
  if (chegadas.length === 0) return null;

  const ordenadas = [...chegadas].sort(
    (a, b) => Number(b.severidade === 'urgente') - Number(a.severidade === 'urgente')
  );
  const cartoes = ordenadas.slice(0, MAX_CARTOES);
  const restantes = ordenadas.slice(MAX_CARTOES);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
      {cartoes.map((n) => {
        const urgente = n.severidade === 'urgente';
        return (
          <div
            key={n.id}
            role="alert"
            className={cn(
              'pointer-events-auto relative overflow-hidden rounded-xl border bg-card p-4 shadow-lg duration-300 animate-in slide-in-from-bottom-4 fade-in',
              urgente ? 'border-destructive ring-2 ring-destructive/30' : 'border-border'
            )}
          >
            {urgente && (
              <div className="pointer-events-none absolute inset-0 bg-destructive/5" aria-hidden />
            )}
            <div className="relative flex items-start gap-3">
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  urgente ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                )}
              >
                {urgente ? <AlertTriangle className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-sm font-semibold',
                    urgente ? 'text-destructive' : 'text-foreground'
                  )}
                >
                  {notificacaoTitulo(n)}
                </p>
                {n.mensagem && <p className="mt-0.5 text-sm text-muted-foreground">{n.mensagem}</p>}

                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant={urgente ? 'destructive' : 'default'}
                    className="h-8"
                    onClick={() => {
                      dispensarChegada(n.id);
                      navigate(notificacaoLink(n));
                    }}
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    {notificacaoLabel(n)}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={() => dispensarChegada(n.id)}
                  >
                    <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                    Ocultar
                  </Button>
                </div>
              </div>

              <button
                type="button"
                aria-label="Ocultar aviso (continua por resolver)"
                title="Ocultar — o aviso continua por resolver, só sai daqui"
                onClick={() => dispensarChegada(n.id)}
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}

      {restantes.length > 0 && (
        <button
          type="button"
          onClick={() => navigate('/notificacoes')}
          className="pointer-events-auto flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-lg transition-colors hover:bg-muted/50 duration-300 animate-in slide-in-from-bottom-4 fade-in"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Bell className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              +{restantes.length} {restantes.length === 1 ? 'aviso novo' : 'avisos novos'}
            </p>
            <p className="text-xs text-muted-foreground">Ver a lista completa</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      )}

      <div className="pointer-events-auto flex items-center gap-0.5 self-end rounded-full border border-border bg-card p-1 shadow-lg duration-300 animate-in slide-in-from-bottom-4 fade-in">
        {chegadas.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 rounded-full px-3 text-xs text-foreground"
              title="Fecha os avisos que estão à vista — continuam todos por resolver"
              onClick={() => ordenadas.forEach((n) => dispensarChegada(n.id))}
            >
              <EyeOff className="mr-1.5 h-3.5 w-3.5" />
              Ocultar todas ({chegadas.length})
            </Button>
            <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
          </>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 rounded-full px-3 text-xs text-foreground"
          onClick={() => navigate('/notificacoes')}
        >
          <List className="mr-1.5 h-3.5 w-3.5" />
          Ver todas
        </Button>
      </div>
    </div>
  );
};
