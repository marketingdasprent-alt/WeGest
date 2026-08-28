import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useThemedLogo } from '@/hooks/useThemedLogo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  aoClicarNaAncora,
  comportamentoDeScroll,
  irParaSeccao,
} from '@/components/site/navegacaoAncoras';
import {
  AUTOMACOES,
  COMO_FUNCIONA,
  CUSTO,
  DEMO,
  MUDANCA,
  OBJECOES,
  PROVA,
  RECONHECIMENTO,
} from '@/components/site/content/landingContent';

/**
 * O índice da página, pela ordem do argumento.
 *
 * As etiquetas vêm de `landingContent` e não de literais aqui: uma secção que
 * mude de nome tem de mudar de nome também no índice, senão o índice deixa de
 * descrever a página.
 *
 * `barra` marca as quatro que cabem na barra estreita. As outras quatro são a
 * parte narrativa — quem já está a meio da página não navega para "o que
 * acontece hoje", mas quem abre o índice quer ver que a página tem princípio.
 */
const SECCOES = [
  { id: 'reconhecimento', etiqueta: RECONHECIMENTO.etiqueta, barra: false },
  { id: 'custo', etiqueta: CUSTO.etiqueta, barra: false },
  { id: 'mudanca', etiqueta: MUDANCA.etiqueta, barra: false },
  { id: 'como-funciona', etiqueta: COMO_FUNCIONA.etiqueta, barra: false },
  { id: 'sistema', etiqueta: DEMO.etiqueta, barra: true },
  { id: 'automacoes', etiqueta: AUTOMACOES.etiqueta, barra: true },
  { id: 'prova', etiqueta: PROVA.etiqueta, barra: true },
  { id: 'objecoes', etiqueta: OBJECOES.etiqueta, barra: true },
] as const;

const NA_BARRA = SECCOES.filter((seccao) => seccao.barra);

/** A que altura do ecrã se considera que uma secção começou a ser lida. */
const LINHA_DE_LEITURA = 0.3;

/**
 * Tempo que o painel lateral leva a sair (`data-[state=closed]:duration-300`
 * em `ui/sheet.tsx`). O Radix só devolve o scroll do body no fim dessa
 * animação, e um scroll suave lançado antes disso é cortado a meio.
 */
const FECHO_DO_PAINEL_MS = 300;

interface EstadoDaLeitura {
  /**
   * A barra ganha fundo e encolhe. Acontece ao primeiro scroll: enquanto o
   * hero desliza, um cabeçalho transparente escreve por cima do H1.
   */
  condensado: boolean;
  /** Secção que o visitante está a ler, ou `null` enquanto está no hero. */
  ativa: string | null;
}

/**
 * Uma só medição por frame decide tudo o que o cabeçalho sabe sobre o scroll.
 *
 * Antes eram duas fontes: um `IntersectionObserver` para a secção ativa e um
 * listener de scroll para o progresso. Além de poderem discordar, o observador
 * acumulava num `Set` que secções estavam na banda — e numa navegação por
 * âncora uma secção atravessa a banda inteira entre dois frames, ficando lá
 * presa para sempre. Aqui a secção ativa é recalculada do zero a cada frame a
 * partir da geometria, por isso não há estado que possa encravar.
 *
 * O progresso não passa pelo estado do React: escrever `scaleX` diretamente no
 * nó evita um render por frame de scroll. Ao estado só chegam `condensado` e
 * `ativa`, que mudam raramente — e o React ignora um `set` com o mesmo valor.
 */
const useEstadoDaLeitura = (linhaRef: React.RefObject<HTMLSpanElement>): EstadoDaLeitura => {
  const [estado, setEstado] = useState<EstadoDaLeitura>({ condensado: false, ativa: null });

  useEffect(() => {
    let pedido = 0;

    const medir = () => {
      pedido = 0;
      const alturaEcra = window.innerHeight;
      const percorrivel = document.documentElement.scrollHeight - alturaEcra;
      const progresso = percorrivel > 0 ? Math.min(1, window.scrollY / percorrivel) : 0;

      if (linhaRef.current) {
        linhaRef.current.style.transform = `scaleX(${progresso})`;
      }

      // A última secção cujo topo já passou a linha de leitura. As secções
      // estão por ordem no DOM, logo a primeira que ainda não passou encerra
      // a procura.
      const linha = alturaEcra * LINHA_DE_LEITURA;
      let ativa: string | null = null;
      for (const seccao of SECCOES) {
        const topo = document.getElementById(seccao.id)?.getBoundingClientRect().top;
        if (topo === undefined) continue;
        if (topo > linha) break;
        ativa = seccao.id;
      }

      // O fundo entra ao primeiro scroll, porque é aí que passa a haver
      // conteúdo a deslizar por baixo da barra: sem fundo, o índice e o
      // "Entrar" ficam escritos por cima do H1 do hero.
      const condensado = window.scrollY > 8;

      setEstado((anterior) =>
        anterior.condensado === condensado && anterior.ativa === ativa
          ? anterior
          : { condensado, ativa }
      );
    };

    // `innerHeight`, `scrollHeight` e os retângulos das secções forçam o
    // cálculo do layout; lê-los a cada evento de scroll punha esse custo no
    // caminho do gesto do visitante.
    const agendar = () => {
      if (pedido) return;
      pedido = requestAnimationFrame(medir);
    };

    medir();
    window.addEventListener('scroll', agendar, { passive: true });
    window.addEventListener('resize', agendar);
    return () => {
      window.removeEventListener('scroll', agendar);
      window.removeEventListener('resize', agendar);
      if (pedido) cancelAnimationFrame(pedido);
    };
  }, [linhaRef]);

  return estado;
};

interface SiteNavProps {
  onCtaClick: () => void;
}

/**
 * Cabeçalho da landing, em dois estados.
 *
 * Parado no topo é transparente, para não desenhar uma caixa por cima do hero.
 * Ao primeiro scroll ganha fundo e encolhe, porque a partir daí há conteúdo a
 * passar por baixo — transparente, escreveria por cima do próprio hero.
 *
 * O conteúdo não muda entre os dois estados: "Falar connosco" está presente
 * desde o primeiro pixel. Chegou a aparecer só depois do hero, para não somar
 * um terceiro CTA aos dois que o hero já tem, mas o botão sempre visível é
 * decisão assente — a barra existe para recuperar quem se convence a meio da
 * página, e uma barra que só mostra a ação a meio caminho falha metade disso.
 *
 * A versão anterior não existia de todo até aos 60% do ecrã, o que deixava o
 * topo da página sem cabeçalho nenhum — só o logo solto dentro do hero.
 */
export const SiteNav = ({ onCtaClick }: SiteNavProps) => {
  const linhaRef = useRef<HTMLSpanElement>(null);
  const { condensado, ativa } = useEstadoDaLeitura(linhaRef);
  const [menuAberto, setMenuAberto] = useState(false);
  const logoSrc = useThemedLogo();

  const voltarAoTopo = useCallback((evento: React.MouseEvent) => {
    evento.preventDefault();
    window.scrollTo({ top: 0, behavior: comportamentoDeScroll() });
    window.history.replaceState(null, '', '#topo');
  }, []);

  const navegarNoIndice = useCallback((evento: React.MouseEvent, id: string) => {
    evento.preventDefault();
    setMenuAberto(false);
    window.setTimeout(() => irParaSeccao(id), FECHO_DO_PAINEL_MS);
  }, []);

  const pedirContactoDoIndice = useCallback(() => {
    setMenuAberto(false);
    window.setTimeout(onCtaClick, FECHO_DO_PAINEL_MS);
  }, [onCtaClick]);

  return (
    <div
      className={cn(
        'fixed inset-x-0 top-0 z-40 border-b transition-colors duration-300 motion-reduce:transition-none',
        condensado
          ? 'border-border/50 bg-background/85 backdrop-blur-md'
          : 'border-transparent bg-transparent'
      )}
    >
      <nav
        aria-label="Navegação do site"
        className={cn(
          'mx-auto flex w-full max-w-6xl items-center gap-7 px-6 transition-[height] duration-300 motion-reduce:transition-none lg:px-16',
          condensado ? 'h-16' : 'h-20'
        )}
      >
        <a
          href="#topo"
          onClick={voltarAoTopo}
          aria-label="WeGest — início da página"
          className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <img
            src={logoSrc}
            alt="WeGest"
            className={cn(
              'w-auto object-contain transition-[height] duration-300 motion-reduce:transition-none',
              condensado ? 'h-7' : 'h-8'
            )}
          />
        </a>

        {/* A mesma régua de 1px das secções, a separar marca de índice. */}
        <span aria-hidden="true" className="hidden h-5 w-px shrink-0 bg-border/60 lg:block" />

        <div className="hidden items-center gap-7 lg:flex">
          {NA_BARRA.map((seccao) => (
            <a
              key={seccao.id}
              href={`#${seccao.id}`}
              onClick={(evento) => aoClicarNaAncora(evento, seccao.id)}
              aria-current={ativa === seccao.id ? 'location' : undefined}
              className={cn(
                // Mesma micro-tipografia das etiquetas de secção: a barra fala
                // a língua da página em vez de ser texto cinzento genérico.
                'relative whitespace-nowrap text-xs font-semibold uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                ativa === seccao.id
                  ? 'text-foreground after:absolute after:inset-x-0 after:-bottom-2 after:h-px after:bg-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {seccao.etiqueta}
            </a>
          ))}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-4">
          <ThemeToggle />
          <Link
            to="/entrar"
            className="hidden text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:block"
          >
            Entrar
          </Link>

          <button
            type="button"
            onClick={onCtaClick}
            className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Falar connosco
          </button>

          <Sheet open={menuAberto} onOpenChange={setMenuAberto}>
            <SheetTrigger
              className="-mr-1 rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
              aria-label="Abrir o índice da página"
            >
              <Menu aria-hidden="true" className="h-5 w-5" />
            </SheetTrigger>

            <SheetContent side="right" className="w-full border-l-border/50 sm:max-w-sm">
              <SheetTitle className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Nesta página
              </SheetTitle>

              {/*
                Numerado porque a ordem carrega informação: a página é um
                argumento contínuo (dor → custo → mudança → sistema → prova →
                objeções), e não uma pilha de secções permutáveis. O número diz
                a quem entra a meio que existe um princípio.
              */}
              <nav aria-label="Índice da página" className="mt-8 flex flex-col">
                {SECCOES.map((seccao, indice) => (
                  <a
                    key={seccao.id}
                    href={`#${seccao.id}`}
                    onClick={(evento) => navegarNoIndice(evento, seccao.id)}
                    aria-current={ativa === seccao.id ? 'location' : undefined}
                    className="flex items-baseline gap-4 border-b border-border/40 py-4 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      aria-hidden="true"
                      className="font-display text-xs tabular-nums text-muted-foreground"
                    >
                      {String(indice + 1).padStart(2, '0')}
                    </span>
                    <span
                      className={
                        ativa === seccao.id
                          ? 'font-medium text-foreground'
                          : 'text-muted-foreground'
                      }
                    >
                      {seccao.etiqueta}
                    </span>
                    {ativa === seccao.id && (
                      <span
                        aria-hidden="true"
                        className="ml-auto h-1.5 w-1.5 self-center rounded-full bg-primary"
                      />
                    )}
                  </a>
                ))}
              </nav>

              <div className="mt-8 flex flex-col gap-4">
                <button
                  type="button"
                  onClick={pedirContactoDoIndice}
                  className="rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Falar connosco
                </button>
                <SheetClose asChild>
                  <Link
                    to="/entrar"
                    className="text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    Entrar
                  </Link>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      {/*
        A espinha deitada. As secções narrativas mostram uma régua vertical de
        1px que codifica que o argumento é contínuo; aqui a mesma régua conta
        quanto desse argumento já foi lido. `scaleX` e não `width` para a
        animação ficar no compositor, longe do layout — e escrito por `ref`,
        fora do estado do React.
      */}
      <span
        ref={linhaRef}
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-primary/50"
      />
    </div>
  );
};
