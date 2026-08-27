import { useRef } from 'react';
import { gsap, useGSAP } from '@/lib/motion/gsapConfig';
import { ArrowDown } from 'lucide-react';
import { aoClicarNaAncora } from '../navegacaoAncoras';
import { AtencaoLedger } from '../AtencaoLedger';
import { HERO } from '../content/landingContent';

interface HeroSectionProps {
  onCtaClick: () => void;
}

/**
 * Hero. Quatro coisas em menos de cinco segundos: o que é (categoria), para
 * quem é (renting e rent-a-car), que problema resolve (depender de memória) e
 * o que fazer a seguir (dois CTA).
 *
 * O sujeito do H1 é "a sua frota" — não "nós". A versão anterior abria com "a
 * nossa própria frota", que é uma afirmação de credibilidade a responder a uma
 * pergunta que o visitante ainda não fez.
 *
 * À direita não há screenshot: há o livro de atenção, que é o *mecanismo*
 * tornado visível. O produto propriamente dito só aparece na secção 6, depois
 * de existir uma razão para o querer ver.
 */
export const HeroSection = ({ onCtaClick }: HeroSectionProps) => {
  const containerRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      // Uma entrada única e curta. Sem stagger por palavra: atrasar a leitura
      // da frase mais importante do site por estética é mau negócio.
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({ defaults: { ease: 'power2.out', duration: 0.5 } });
        tl.from('[data-hero-linha]', { opacity: 0, y: 14, stagger: 0.07 }).from(
          '[data-hero-painel]',
          { opacity: 0, y: 20, duration: 0.6 },
          '-=0.3'
        );
        return () => tl.kill();
      });

      return () => mm.revert();
    },
    { scope: containerRef }
  );

  return (
    <header
      ref={containerRef}
      // `min-h-[100svh]` porque o hero tem de ser dono do primeiro ecrã. Sem
      // isto media só o que o conteúdo media (~670px), e num ecrã alto a
      // secção seguinte entrava na primeira vista cortada a meio — além de
      // fazer a barra condensar já dentro dessa secção.
      //
      // `svh` e não `vh`: no telemóvel, `vh` conta com a barra de endereço
      // recolhida e empurra o CTA para fora do ecrã enquanto ela está aberta.
      //
      // O padding de topo dá folga ao cabeçalho fixo, que agora existe desde o
      // primeiro pixel e já leva a marca — o logo deixou de viver aqui.
      className="relative mx-auto flex min-h-[100svh] w-full max-w-6xl flex-col justify-center px-6 pb-24 pt-28 lg:px-16 lg:pb-28 lg:pt-32"
    >
      <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-7">
          <p
            data-hero-linha
            className="text-xs font-semibold uppercase tracking-[0.12em] text-primary"
          >
            {HERO.categoria}
          </p>

          <h1
            data-hero-linha
            className="mt-5 font-display text-balance text-[clamp(2.25rem,5.5vw,4.25rem)] font-semibold leading-[1.03] tracking-[-0.03em] text-foreground"
          >
            {HERO.titulo}
          </h1>

          <p
            data-hero-linha
            className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground"
          >
            {HERO.subtitulo}
          </p>

          <div data-hero-linha className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <button
              type="button"
              onClick={onCtaClick}
              className="rounded-lg bg-primary px-6 py-3 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {HERO.ctaPrimario}
            </button>

            {/* Segundo CTA para o avaliador que quer ver antes de falar.
                Continua a ser âncora — linkável e copiável; o handler só troca
                o salto instantâneo pelo mesmo scroll suave que o índice usa. */}
            <a
              href="#sistema"
              onClick={(evento) => aoClicarNaAncora(evento, 'sistema')}
              className="group inline-flex items-center gap-2 rounded-md text-base font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {HERO.ctaSecundario}
              <ArrowDown
                aria-hidden="true"
                className="h-4 w-4 transition-transform group-hover:translate-y-0.5"
              />
            </a>
          </div>
        </div>

        <div data-hero-painel className="lg:col-span-5">
          <AtencaoLedger titulo={HERO.ledgerTitulo} limite={4} reveal={false} />
        </div>
      </div>
    </header>
  );
};
