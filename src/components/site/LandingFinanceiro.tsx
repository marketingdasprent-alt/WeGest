import { useRef } from 'react';
import { gsap } from '@/lib/motion/gsapConfig';
import { useSimplifiedMotion } from '@/hooks/useSimplifiedMotion';
import { usePinnedTimeline } from '@/hooks/usePinnedTimeline';
import { formatCounter } from '@/lib/scrollMotion';
import { SectionHeading } from './SectionHeading';

const REVENUE_TARGET = 12480;
const KM_TARGET = 3240;
const CHART_POINTS = '0,38 20,30 40,32 60,18 80,22 100,6';

export const LandingFinanceiro = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const revenueRef = useRef<HTMLParagraphElement>(null);
  const kmRef = useRef<HTMLParagraphElement>(null);
  const lineRef = useRef<SVGPolylineElement>(null);
  const simplified = useSimplifiedMotion();

  usePinnedTimeline(sectionRef, pinRef, simplified, (tl) => {
    const revenueState = { value: 0 };
    const kmState = { value: 0 };

    tl.to(
      revenueState,
      {
        value: REVENUE_TARGET,
        duration: 1,
        onUpdate: () => {
          if (revenueRef.current) {
            revenueRef.current.textContent = `${formatCounter(revenueState.value)} €`;
          }
        },
      },
      0
    ).to(
      kmState,
      {
        value: KM_TARGET,
        duration: 1,
        onUpdate: () => {
          if (kmRef.current) {
            kmRef.current.textContent = `${formatCounter(kmState.value)} km`;
          }
        },
      },
      0
    );

    if (lineRef.current && typeof lineRef.current.getTotalLength === 'function') {
      const length = lineRef.current.getTotalLength();
      gsap.set(lineRef.current, { strokeDasharray: length, strokeDashoffset: length });
      tl.to(lineRef.current, { strokeDashoffset: 0, duration: 1, ease: 'none' }, 0);
    }
  });

  return (
    <section
      ref={sectionRef}
      className={simplified ? 'relative px-6 py-24' : 'relative h-[300vh]'}
    >
      <div
        ref={pinRef}
        className={
          simplified
            ? 'flex flex-col items-center gap-10'
            : 'flex h-screen flex-col items-center justify-center gap-10 overflow-hidden px-6'
        }
      >
        <SectionHeading eyebrow="// financeiro.fluxo" title="Cada semana fecha-se a si própria.">
          Tarifas, quilómetros e movimentos juntam-se num resumo — sem folha de cálculo paralela.
        </SectionHeading>

        <div className="flex gap-10">
          <div className="text-center">
            <p ref={revenueRef} className="text-4xl font-bold text-foreground">
              {formatCounter(REVENUE_TARGET)} €
            </p>
            <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
              receita da semana
            </p>
          </div>
          <div className="text-center">
            <p ref={kmRef} className="text-4xl font-bold text-foreground">
              {formatCounter(KM_TARGET)} km
            </p>
            <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
              percorridos
            </p>
          </div>
        </div>

        <svg viewBox="0 0 100 40" className="h-24 w-full max-w-sm" aria-hidden="true">
          <polyline
            points={CHART_POINTS}
            fill="none"
            stroke="hsl(var(--primary) / 0.2)"
            strokeWidth={1.5}
          />
          <polyline
            ref={lineRef}
            points={CHART_POINTS}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
          />
        </svg>
      </div>
    </section>
  );
};
