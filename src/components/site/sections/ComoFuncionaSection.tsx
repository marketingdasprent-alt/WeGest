import { useRef } from 'react';
import { gsap, useGSAP } from '@/lib/motion/gsapConfig';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Section, SectionLabel, SectionTitle } from '../primitives/Section';
import { COMO_FUNCIONA } from '../content/landingContent';

gsap.registerPlugin(ScrollTrigger);

/**
 * Como funciona. Objetivo: plausibilidade. O visitante já quer o resultado da
 * secção anterior; falta acreditar que chegar lá não é um projeto de seis
 * meses.
 *
 * Três passos ligados por uma régua contínua, não três cards. Cards diriam
 * "três coisas independentes"; a régua diz "uma sequência" — que é o que é
 * verdade. A numeração é legítima aqui porque a ordem transporta informação:
 * não se pode vigiar antes de os dados entrarem.
 */
export const ComoFuncionaSection = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const container = containerRef.current;
      if (!container) return;

      const mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        // A régua desenha-se ao ritmo do scroll e cada passo acende quando ela
        // o alcança: a animação transporta a sequência, que é o conteúdo.
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: container,
            start: 'top 70%',
            end: 'bottom 70%',
            scrub: 0.5,
          },
        });

        tl.fromTo(
          '[data-regua]',
          { scaleX: 0 },
          { scaleX: 1, ease: 'none', transformOrigin: 'left center' },
          0
        ).fromTo('[data-passo]', { opacity: 0.35 }, { opacity: 1, ease: 'none', stagger: 0.4 }, 0);

        return () => {
          tl.scrollTrigger?.kill();
          tl.kill();
        };
      });

      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set('[data-regua]', { scaleX: 1 });
        gsap.set('[data-passo]', { opacity: 1 });
      });

      return () => mm.revert();
    },
    { scope: containerRef }
  );

  return (
    <Section id="como-funciona" espinha>
      <div className="max-w-2xl">
        <SectionLabel>{COMO_FUNCIONA.etiqueta}</SectionLabel>
        <SectionTitle className="mt-4">{COMO_FUNCIONA.titulo}</SectionTitle>
      </div>

      <div ref={containerRef} className="relative mt-16">
        {/* A régua vive atrás dos passos e só existe em ecrã largo, onde os
            três passos ficam de facto lado a lado. */}
        <div
          aria-hidden="true"
          className="absolute left-0 right-0 top-[7px] hidden h-px bg-border md:block"
        >
          <span data-regua className="block h-full w-full bg-primary" />
        </div>

        <ol className="grid gap-12 md:grid-cols-3 md:gap-10">
          {COMO_FUNCIONA.passos.map((passo, index) => (
            <li key={passo.titulo} data-passo className="relative">
              <span
                aria-hidden="true"
                className="mb-6 hidden h-[15px] w-[15px] rounded-full border-2 border-primary bg-background md:block"
              />
              <span className="text-xs font-semibold tabular-nums tracking-[0.12em] text-primary">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-3 font-display text-lg font-semibold tracking-[-0.01em] text-foreground">
                {passo.titulo}
              </h3>
              <p className="mt-2 text-[1.0625rem] leading-relaxed text-muted-foreground">
                {passo.corpo}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
};
