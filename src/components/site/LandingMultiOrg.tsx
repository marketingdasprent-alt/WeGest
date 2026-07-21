import { useRef } from 'react';
import { motion, useScroll, useTransform, useMotionValue, type MotionValue } from 'framer-motion';
import { useSimplifiedMotion } from '@/hooks/useSimplifiedMotion';
import { SectionHeading } from './SectionHeading';

const LANES = ['Organização A', 'Organização B', 'Organização C'];

export const LandingMultiOrg = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const simplified = useSimplifiedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });
  const staticValue = useMotionValue(1);
  const progress = simplified ? staticValue : scrollYProgress;

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
        <SectionHeading eyebrow="// organizacoes.isoladas" title="Cada organização no seu fluxo.">
          Os dados de uma empresa nunca tocam nos de outra — por definição, não por confiança.
        </SectionHeading>

        <div className="flex w-full max-w-2xl flex-col gap-4">
          {LANES.map((lane, index) => (
            <Lane key={lane} label={lane} index={index} progress={progress} />
          ))}
        </div>
      </div>
    </section>
  );
};

interface LaneProps {
  label: string;
  index: number;
  progress: MotionValue<number>;
}

const Lane = ({ label, index, progress }: LaneProps) => {
  const delayed = useTransform(progress, (value) => Math.max(0, value - index * 0.1));
  const barWidth = useTransform(delayed, [0, 1], ['0%', '100%']);

  return (
    <div className="flex items-center gap-4">
      <span className="w-32 shrink-0 font-mono text-xs text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-card">
        <motion.div className="h-full rounded-full bg-primary" style={{ width: barWidth }} />
      </div>
    </div>
  );
};
