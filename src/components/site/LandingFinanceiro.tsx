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
  const revenueRef = useRef<HTMLParagraphElement>(null);
  const kmRef = useRef<HTMLParagraphElement>(null);
  const lineRef = useRef<SVGPolylineElement>(null);
  const simplified = useSimplifiedMotion();

  usePinnedTimeline(sectionRef, simplified, (tl) => {
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
      className={
        simplified
          ? 'relative px-6 py-24'
          : 'relative flex h-screen flex-col justify-center overflow-hidden px-6 lg:px-16'
      }
    >
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="flex flex-col gap-10">
          <SectionHeading
            align="left"
            eyebrow="// financeiro.fluxo"
            title="Cada semana fecha-se a si própria."
          >
            Tarifas, quilómetros e movimentos juntam-se num resumo — sem folha de cálculo
            paralela.
          </SectionHeading>

          <div className="flex gap-12">
            <div>
              <p ref={revenueRef} className="text-5xl font-bold text-foreground">
                {formatCounter(REVENUE_TARGET)} €
              </p>
              <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                receita da semana
              </p>
            </div>
            <div>
              <p ref={kmRef} className="text-5xl font-bold text-foreground">
                {formatCounter(KM_TARGET)} km
              </p>
              <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
                percorridos
              </p>
            </div>
          </div>
        </div>

        <div className="w-full rounded-2xl border border-primary/15 bg-card/40 p-8 backdrop-blur-sm">
          <svg
            viewBox="0 0 100 40"
            preserveAspectRatio="none"
            className="h-64 w-full"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="financeiroFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polygon points={`${CHART_POINTS} 100,40 0,40`} fill="url(#financeiroFill)" />
            <polyline
              points={CHART_POINTS}
              fill="none"
              stroke="hsl(var(--primary) / 0.15)"
              strokeWidth={1.5}
            />
            <polyline
              ref={lineRef}
              points={CHART_POINTS}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
            />
          </svg>
        </div>
      </div>
    </section>
  );
};
