import { Suspense, useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Section, SectionLabel, SectionTitle, SectionLead } from '../primitives/Section';
import { DEMO_TABS, indiceDoSlug } from './demoTabs';
import { DEMO } from '../content/landingContent';

interface DemoSectionProps {
  onCtaClick: () => void;
}

/**
 * Demonstração. O produto aparece aqui — na posição 6 — e não no topo, porque
 * mostrar um dashboard a quem ainda não admitiu ter um problema produz "é
 * bonito", que não é "preciso disto".
 *
 * Substitui o tour com captura de roda do rato. O que se ganha:
 *  - a posição é linkável e partilhável (`?demo=contratos`);
 *  - o botão "voltar" do browser funciona;
 *  - o comprimento da página deixa de mentir sobre a quantidade de conteúdo;
 *  - teclado e leitores de ecrã funcionam, via `tablist` a sério.
 */
export const DemoSection = ({ onCtaClick }: DemoSectionProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeIndex, setActiveIndex] = useState(() => indiceDoSlug(searchParams.get('demo')));
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selecionar = useCallback(
    (index: number, moverFoco = false) => {
      setActiveIndex(index);
      // `replace`: navegar pelas tabs não deve enterrar o histórico do
      // visitante — mas o URL fica partilhável.
      const next = new URLSearchParams(searchParams);
      next.set('demo', DEMO_TABS[index].key);
      setSearchParams(next, { replace: true });
      if (moverFoco) tabRefs.current[index]?.focus();
    },
    [searchParams, setSearchParams]
  );

  // Padrão de teclado esperado num tablist: setas navegam, Home/End saltam.
  // Vive nos próprios botões (e não no `tablist`), porque é o botão ativo que
  // detém o foco — o tablist não é, nem deve ser, focável.
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const ultimo = DEMO_TABS.length - 1;
    const mapa: Record<string, number> = {
      ArrowRight: activeIndex === ultimo ? 0 : activeIndex + 1,
      ArrowLeft: activeIndex === 0 ? ultimo : activeIndex - 1,
      Home: 0,
      End: ultimo,
    };
    const proximo = mapa[event.key];
    if (proximo === undefined) return;
    event.preventDefault();
    selecionar(proximo, true);
  };

  const { Panel, key: activeKey, label: activeLabel } = DEMO_TABS[activeIndex];

  return (
    <Section id="sistema" espinha destaque>
      <div className="max-w-2xl">
        <SectionLabel>{DEMO.etiqueta}</SectionLabel>
        <SectionTitle className="mt-4">{DEMO.titulo}</SectionTitle>
        <SectionLead className="mt-5">{DEMO.corpo}</SectionLead>
      </div>

      {/* Em mobile a fila de tabs faz scroll horizontal — não se dobra em duas
          linhas nem encolhe o texto até ficar ilegível. */}
      <div
        role="tablist"
        aria-label="Módulos do sistema"
        className="mt-12 flex gap-1 overflow-x-auto border-b border-border/60 pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {DEMO_TABS.map((tab, index) => {
          const ativa = index === activeIndex;
          return (
            <button
              key={tab.key}
              ref={(el) => (tabRefs.current[index] = el)}
              type="button"
              role="tab"
              id={`demo-tab-${tab.key}`}
              aria-selected={ativa}
              aria-controls={`demo-panel-${tab.key}`}
              tabIndex={ativa ? 0 : -1}
              onClick={() => selecionar(index)}
              onKeyDown={handleKeyDown}
              className={cn(
                'relative shrink-0 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                ativa ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
              {ativa && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                />
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`demo-panel-${activeKey}`}
        aria-labelledby={`demo-tab-${activeKey}`}
        tabIndex={0}
        className="mt-8 overflow-hidden rounded-xl border border-border/70 bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Altura fixa: sem isto, cada troca de tab reflui a página e desloca
            o que o visitante está a ler. */}
        <div className="h-[min(70vh,560px)]">
          <Suspense fallback={<div className="h-full w-full animate-pulse bg-muted/30" />}>
            <Panel />
          </Suspense>
        </div>
      </div>

      {/* Anuncia a troca de painel a quem usa leitor de ecrã — o `AnimatePresence`
          da versão anterior trocava o conteúdo em silêncio. */}
      <p aria-live="polite" className="sr-only">
        {activeLabel}
      </p>

      <button
        type="button"
        onClick={onCtaClick}
        className="group mt-8 inline-flex items-center gap-2 rounded-md text-[0.9375rem] font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {DEMO.ctaTexto}
        <ArrowRight
          aria-hidden="true"
          className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
        />
      </button>
    </Section>
  );
};
