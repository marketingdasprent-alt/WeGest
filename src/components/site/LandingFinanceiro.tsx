import { useRef } from 'react';
import { motion, useScroll, useTransform, useMotionValue } from 'framer-motion';
import { useSimplifiedMotion } from '@/hooks/useSimplifiedMotion';
import { useMotionValueText } from '@/hooks/useMotionValueText';
import { formatCounter } from '@/lib/scrollMotion';
import { SectionHeading } from './SectionHeading';

const REVENUE_TARGET = 12480;
const KM_TARGET = 3240;
const CHART_POINTS = '0,38 20,30 40,32 60,18 80,22 100,6';

export const LandingFinanceiro = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const simplified = useSimplifiedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const revenueScroll = useTransform(scrollYProgress, [0, 1], [0, REVENUE_TARGET]);
  const kmScroll = useTransform(scrollYProgress, [0, 1], [0, KM_TARGET]);
  const pathScroll = useTransform(scrollYProgress, [0, 1], [0, 1]);

  const revenueStatic = useMotionValue(REVENUE_TARGET);
  const kmStatic = useMotionValue(KM_TARGET);
  const pathStatic = useMotionValue(1);

  const revenue = simplified ? revenueStatic : revenueScroll;
  const km = simplified ? kmStatic : kmScroll;
  const pathLength = simplified ? pathStatic : pathScroll;

  const revenueText = useMotionValueText(revenue, (v) => `${formatCounter(v)} €`);
  const kmText = useMotionValueText(km, (v) => `${formatCounter(v)} km`);

  return (
    <section
      ref={sectionRef}
      className={simplified ? 'relative px-6 py-24' : 'relative h-[300vh]'}
    >
      <div
        className={
          simplified
            ? 'flex flex-col items-center gap-10'
            : 'sticky top-0 flex h-screen flex-col items-center justify-center gap-10 overflow-hidden px-6'
        }
      >
        <SectionHeading eyebrow="// financeiro.fluxo" title="Cada semana fecha-se a si própria.">
          Tarifas, quilómetros e movimentos juntam-se num resumo — sem folha de cálculo paralela.
        </SectionHeading>

        <div className="flex gap-10">
          <div className="text-center">
            <p className="text-3xl font-bold text-foreground">{revenueText}</p>
            <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
              receita da semana
            </p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-foreground">{kmText}</p>
            <p className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">
              percorridos
            </p>
          </div>
        </div>

        <svg viewBox="0 0 100 40" className="h-24 w-full max-w-sm" aria-hidden="true">
          <polyline points={CHART_POINTS} fill="none" stroke="hsl(var(--primary) / 0.2)" strokeWidth={1.5} />
          <motion.polyline
            points={CHART_POINTS}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={1.5}
            style={{ pathLength }}
          />
        </svg>
      </div>
    </section>
  );
};
