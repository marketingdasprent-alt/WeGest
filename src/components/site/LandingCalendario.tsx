import { useRef } from 'react';
import { gsap } from '@/lib/motion/gsapConfig';
import { useSimplifiedMotion } from '@/hooks/useSimplifiedMotion';
import { usePinnedTimeline } from '@/hooks/usePinnedTimeline';
import { SectionHeading } from './SectionHeading';

const TOTAL_CELLS = 28;

export const LandingCalendario = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const simplified = useSimplifiedMotion();

  usePinnedTimeline(sectionRef, pinRef, simplified, (tl) => {
    if (!gridRef.current) return;
    const cells = gsap.utils.toArray<HTMLElement>(gridRef.current.children);
    tl.fromTo(
      cells,
      { opacity: 0.1, scale: 0.85 },
      { opacity: 1, scale: 1, duration: 1, stagger: 0.12, ease: 'power1.out' },
      0
    );
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
        <SectionHeading eyebrow="// calendario.derivado" title="O calendário preenche-se sozinho.">
          Check-ins, check-outs e renovações aparecem porque aconteceram — não porque alguém os
          desenhou.
        </SectionHeading>

        <div
          ref={gridRef}
          className="grid w-full max-w-md grid-cols-7 gap-1.5"
          data-testid="mock-calendar"
        >
          {Array.from({ length: TOTAL_CELLS }, (_, index) => (
            <div key={index} className="aspect-square rounded-sm bg-primary" />
          ))}
        </div>
      </div>
    </section>
  );
};
