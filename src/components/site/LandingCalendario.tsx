import { useRef } from 'react';
import { gsap } from '@/lib/motion/gsapConfig';
import { useSimplifiedMotion } from '@/hooks/useSimplifiedMotion';
import { usePinnedTimeline } from '@/hooks/usePinnedTimeline';
import { SectionHeading } from './SectionHeading';

const TOTAL_CELLS = 35;
const WEEKDAYS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

export const LandingCalendario = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const simplified = useSimplifiedMotion();

  usePinnedTimeline(sectionRef, simplified, (tl) => {
    if (!gridRef.current) return;
    const cells = gsap.utils.toArray<HTMLElement>(gridRef.current.children);
    tl.fromTo(
      cells,
      { opacity: 0.08, scale: 0.8 },
      { opacity: 1, scale: 1, duration: 1, stagger: 0.1, ease: 'power1.out' },
      0
    );
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
        <SectionHeading
          align="left"
          eyebrow="// calendario.derivado"
          title="O calendário preenche-se sozinho."
        >
          Check-ins, check-outs e renovações aparecem porque aconteceram — não porque alguém os
          desenhou.
        </SectionHeading>

        <div className="w-full max-w-lg justify-self-center">
          <div className="mb-2 grid grid-cols-7 gap-2">
            {WEEKDAYS.map((day, index) => (
              <span
                key={`${day}-${index}`}
                className="text-center font-mono text-xs text-muted-foreground/60"
              >
                {day}
              </span>
            ))}
          </div>
          <div ref={gridRef} className="grid grid-cols-7 gap-2" data-testid="mock-calendar">
            {Array.from({ length: TOTAL_CELLS }, (_, index) => (
              <div key={index} className="aspect-square rounded-md bg-primary" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
