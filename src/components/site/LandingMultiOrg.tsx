import { useRef } from 'react';
import { gsap } from '@/lib/motion/gsapConfig';
import { useSimplifiedMotion } from '@/hooks/useSimplifiedMotion';
import { usePinnedTimeline } from '@/hooks/usePinnedTimeline';
import { SectionHeading } from './SectionHeading';

const LANES = ['Organização A', 'Organização B', 'Organização C'];

export const LandingMultiOrg = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const simplified = useSimplifiedMotion();

  usePinnedTimeline(sectionRef, pinRef, simplified, (tl) => {
    if (!lanesRef.current) return;
    const bars = gsap.utils.toArray<HTMLElement>(lanesRef.current.querySelectorAll('[data-bar]'));
    tl.fromTo(
      bars,
      { scaleX: 0 },
      { scaleX: 1, duration: 1, stagger: 0.15, ease: 'power2.out' },
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
        <SectionHeading eyebrow="// organizacoes.isoladas" title="Cada organização no seu fluxo.">
          Os dados de uma empresa nunca tocam nos de outra — por definição, não por confiança.
        </SectionHeading>

        <div ref={lanesRef} className="flex w-full max-w-2xl flex-col gap-4">
          {LANES.map((lane) => (
            <div key={lane} className="flex items-center gap-4">
              <span className="w-32 shrink-0 font-mono text-xs text-muted-foreground">{lane}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-card">
                <div data-bar className="h-full origin-left rounded-full bg-primary" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
