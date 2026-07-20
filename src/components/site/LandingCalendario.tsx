import { useRef } from 'react';
import { motion, useScroll, useTransform, useMotionValue, type MotionValue } from 'framer-motion';
import { useSimplifiedMotion } from '@/hooks/useSimplifiedMotion';
import { SectionHeading } from './SectionHeading';

const TOTAL_CELLS = 28;

export const LandingCalendario = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const simplified = useSimplifiedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const scrollDriven = useTransform(scrollYProgress, [0, 1], [0, TOTAL_CELLS]);
  const staticValue = useMotionValue(TOTAL_CELLS);
  const filledCount = simplified ? staticValue : scrollDriven;

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
        <SectionHeading eyebrow="// calendario.derivado" title="O calendário preenche-se sozinho.">
          Check-ins, check-outs e renovações aparecem porque aconteceram — não porque alguém os
          desenhou.
        </SectionHeading>

        <div
          className="grid w-full max-w-md grid-cols-7 gap-1.5"
          data-testid="mock-calendar"
        >
          {Array.from({ length: TOTAL_CELLS }, (_, index) => (
            <CalendarCell key={index} index={index} filledCount={filledCount} />
          ))}
        </div>
      </div>
    </section>
  );
};

interface CalendarCellProps {
  index: number;
  filledCount: MotionValue<number>;
}

const CalendarCell = ({ index, filledCount }: CalendarCellProps) => {
  const opacity = useTransform(filledCount, (count) => (count > index ? 1 : 0.12));

  return <motion.div className="aspect-square rounded-sm bg-primary" style={{ opacity }} />;
};
