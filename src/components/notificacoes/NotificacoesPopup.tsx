import { useEffect, useRef } from 'react';
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

/**
 * Quanto tempo um aviso normal fica no canto antes de sair sozinho.
 *
 * Longo o suficiente para se ler um título e uma linha de mensagem sem
 * pressa, curto o suficiente para não se acumular com o aviso seguinte.
 * Os urgentes não usam isto: ver `ehUrgente` abaixo.
 */
const AUTO_DISPENSA_MS = 10_000;

/**
 * Avisos do que ACABOU de acontecer — não do que está por resolver.
 *
 * ANTES: este componente mostrava `notificacoes`, a lista inteira de
 * não-resolvidas. Isso fazia dele um espelho permanente do backlog:
 *
 *  - entrar no sistema ou dar F5 enchia o canto outra vez;
 *  - o "Ocultar" vivia em sessionStorage, logo era por ABA e por sessão de
 *    browser — abrir um segundo separador trazia tudo de volta;
 *  - o agrupamento cria uma linha nova por (tipo, dia), por isso o mesmo
 *    seguro por tratar gerava um cartão novo todos os dias, com id novo, que
 *    o "ocultar" de ontem não apanhava.
 *
 * O resultado prático era o utilizador a fechar os mesmos avisos várias vezes
 * por dia — e a aprender a fechá-los sem ler, que é o oposto do objectivo de
 * um alerta.
 *
 * AGORA: o canto mostra `chegadas` (o que entrou depois de a app arrancar),
 * cada aviso aparece uma vez, e o backlog vive onde se pode trabalhar sobre
 * ele — o sino e /notificacoes. Sem persistência nenhuma: não é precisa,
 * porque a lista nunca se repõe a partir do backlog.
 */
export const NotificacoesPopup = () => {
  const navigate = useNavigate();

  const { chegadas, dispensarChegada, enabled } = useNotificacoesContext();

  // Um temporizador por aviso, agendado UMA vez. Guardado em ref e não
  // limpo no cleanup do efeito de propósito: `chegadas` muda a cada aviso
  // novo, e limpar aí cancelaria a contagem dos que já estavam no ecrã —
  // ficariam presos até o utilizador os fechar à mão.
  const temporizadores = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    for (const n of chegadas) {
      // Um escalonamento exige uma decisão humana: não pode evaporar-se
      // enquanto o supervisor está a olhar para outro lado.
      if (n.severidade === 'urgente') continue;
      if (temporizadores.current.has(n.id)) continue;

      const id = window.setTimeout(() => {
        temporizadores.current.delete(n.id);
        dispensarChegada(n.id);
      }, AUTO_DISPENSA_MS);
      temporizadores.current.set(n.id, id);
    }
  }, [chegadas, dispensarChegada]);

  // Só na desmontagem: sem isto, um timeout pendente dispararia sobre um
  // componente que já não existe.
  useEffect(() => {
    const pendentes = temporizadores.current;
    return () => {
      pendentes.forEach((id) => window.clearTimeout(id));
      pendentes.clear();
    };
  }, []);

  // Desbloqueia o áudio no primeiro gesto do utilizador (autoplay policy),
  // para que o aviso urgente ao supervisor toque mesmo sem clique imediato.
  useEffect(() => {
    if (enabled) armNotificationSound();
  }, [enabled]);

  if (!enabled) return null;
  if (chegadas.length === 0) return null;

  // Urgentes primeiro (nunca resumidos), o resto mantém a ordem de chegada.
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
              // `bg-card` é a base OPACA e vem sempre — este cartão flutua por
              // cima do conteúdo da página (fixed bottom-right). O tom vermelho
              // do urgente é uma camada por cima, não o fundo: com
              // `bg-destructive/5` sozinho o cartão ficava a 5% de opacidade e
              // via-se a página através dele.
              'pointer-events-auto relative overflow-hidden rounded-xl border bg-card p-4 shadow-lg duration-300 animate-in slide-in-from-bottom-4 fade-in',
              urgente ? 'border-destructive ring-2 ring-destructive/30' : 'border-border'
            )}
          >
            {urgente && (
              <div className="pointer-events-none absolute inset-0 bg-destructive/5" aria-hidden />
            )}
            {/* `relative` para o conteúdo ficar acima da camada de cor. */}
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

      {/* Barra própria, com fundo: estes botões ficam FORA dos cartões, por
          cima do conteúdo da página. Em ghost sem fundo liam-se por cima de
          seja o que for que estivesse por trás — texto sobre texto. Levam a
          mesma casca dos cartões (bg-card + borda + sombra) para pertencerem
          visualmente à pilha de avisos em vez de flutuarem soltos. */}
      <div className="pointer-events-auto flex items-center gap-0.5 self-end rounded-full border border-border bg-card p-1 shadow-lg duration-300 animate-in slide-in-from-bottom-4 fade-in">
        {/* Só com mais do que um aviso à vista: para um único cartão o X e o
            "Ocultar" já chegam, e um terceiro botão para o mesmo efeito só
            confundia. */}
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
