import { useRef } from 'react';
import { Building2 } from 'lucide-react';
import { gsap } from '@/lib/motion/gsapConfig';
import { useSimplifiedMotion } from '@/hooks/useSimplifiedMotion';
import { usePinnedTimeline } from '@/hooks/usePinnedTimeline';
import { SectionHeading } from './SectionHeading';

const LANES = ['Organização A', 'Organização B', 'Organização C'];

export const LandingMultiOrg = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const simplified = useSimplifiedMotion();

  usePinnedTimeline(sectionRef, simplified, (tl) => {
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
      className={
        simplified
          ? 'relative px-6 py-24'
          : 'relative flex h-screen flex-col justify-center overflow-hidden px-6 lg:px-16'
      }
    >
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <SectionHeading
          align="left"
          eyebrow="// organizacoes.isoladas"
          title="Cada organização no seu fluxo."
        >
          Os dados de uma empresa nunca tocam nos de outra — por definição, não por confiança.
        </SectionHeading>

        <div ref={lanesRef} className="flex w-full flex-col gap-4">
          {LANES.map((lane) => (
            <div
              key={lane}
              className="rounded-xl border border-primary/20 bg-card/60 p-6 backdrop-blur-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-sm text-foreground">{lane}</span>
                <Building2 className="h-4 w-4 text-primary/60" />
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-background/60">
                <div data-bar className="h-full origin-left rounded-full bg-primary" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
