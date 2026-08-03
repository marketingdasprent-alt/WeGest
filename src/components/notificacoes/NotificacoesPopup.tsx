import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificacoesContext } from '@/contexts/NotificacoesContext';
import { armNotificationSound } from '@/lib/notificationSound';
import { notificacaoLink, notificacaoLabel, notificacaoTitulo } from '@/utils/notificacoes';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertTriangle, Bell, ChevronRight, Eye, EyeOff, List, X } from 'lucide-react';

// Mostrar um cartão por aviso deixa de caber no ecrã a partir de umas
// poucas notificações em simultâneo (ex.: um backlog de vistorias/licenças
// a expirar gera dezenas de uma vez) — acima disto, os extra ficam
// resumidos num único cartão em vez de empilhados.
const MAX_CARTOES = 3;

export const NotificacoesPopup = () => {
  const navigate = useNavigate();

  const { notificacoes, enabled } = useNotificacoesContext();

  // Ocultar é só visual (por sessão) — ao contrário de "Resolver", nunca
  // marca a notificação como tratada. Antes disto o botão "Fechar" chamava
  // resolver() diretamente: um clique para tirar o cartão da frente dos
  // olhos apagava o aviso também da lista "Não resolvidas" e do histórico,
  // sem qualquer confirmação de que o problema real (carta a expirar, IUC
  // por pagar...) tinha sido tratado.
  const [ocultados, setOcultados] = useState<Set<string>>(new Set());
  const ocultar = (id: string) => setOcultados((atual) => new Set(atual).add(id));

  // Ocultar de uma vez tudo o que está à vista. Um backlog (dezenas de
  // vistorias/licenças a expirar de uma assentada) obrigava a fechar aviso a
  // aviso para se poder trabalhar. Só afeta os que já subiram: os que
  // chegarem a seguir voltam a aparecer, porque continuam por resolver e
  // fechar não é uma decisão permanente.
  const ocultarTodas = (ids: string[]) =>
    setOcultados((atual) => {
      const novo = new Set(atual);
      ids.forEach((id) => novo.add(id));
      return novo;
    });

  // Desbloqueia o áudio no primeiro gesto do utilizador (autoplay policy),
  // para que o aviso urgente ao supervisor toque mesmo sem clique imediato.
  useEffect(() => {
    if (enabled) armNotificationSound();
  }, [enabled]);

  if (!enabled) return null;

  const visiveis = notificacoes.filter((n) => !ocultados.has(n.id));
  if (visiveis.length === 0) return null;

  // Urgentes primeiro (nunca resumidos), o resto mantém a ordem de chegada.
  const ordenadas = [...visiveis].sort(
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
              'pointer-events-auto rounded-xl border p-4 shadow-lg duration-300 animate-in slide-in-from-bottom-4 fade-in',
              urgente
                ? 'border-destructive bg-destructive/5 ring-2 ring-destructive/30'
                : 'border-border bg-card'
            )}
          >
            <div className="flex items-start gap-3">
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
                  {/* Sem o emoji 🔴: a urgência já está no ícone, na cor do
                      texto, na borda e no anel — cinco sinais para a mesma
                      coisa, e o emoji era o único que entrava no texto lido
                      por um leitor de ecrã como "círculo vermelho grande". */}
                  {notificacaoTitulo(n)}
                </p>
                {n.mensagem && <p className="mt-0.5 text-sm text-muted-foreground">{n.mensagem}</p>}

                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant={urgente ? 'destructive' : 'default'}
                    className="h-8"
                    onClick={() => navigate(notificacaoLink(n))}
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    {notificacaoLabel(n)}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => ocultar(n.id)}>
                    <EyeOff className="mr-1.5 h-3.5 w-3.5" />
                    Ocultar
                  </Button>
                </div>
              </div>

              <button
                type="button"
                aria-label="Ocultar aviso (continua por resolver)"
                title="Ocultar — o aviso continua por resolver, só sai daqui"
                onClick={() => ocultar(n.id)}
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
              +{restantes.length} {restantes.length === 1 ? 'aviso' : 'avisos'} por resolver
            </p>
            <p className="text-xs text-muted-foreground">Ver a lista completa</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      )}

      <div className="pointer-events-auto flex items-center gap-1 self-end">
        {/* Só com mais do que um aviso à vista: para um único cartão o X e o
            "Ocultar" já chegam, e um terceiro botão para o mesmo efeito só
            confundia. */}
        {visiveis.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            title="Fecha os avisos que estão à vista — continuam todos por resolver"
            onClick={() => ocultarTodas(ordenadas.map((n) => n.id))}
          >
            <EyeOff className="mr-1.5 h-3.5 w-3.5" />
            Ocultar todas ({visiveis.length})
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => navigate('/notificacoes')}
        >
          <List className="mr-1.5 h-3.5 w-3.5" />
          Ver todas
        </Button>
      </div>
    </div>
  );
};
