import { useRef } from 'react';
import { gsap } from '@/lib/motion/gsapConfig';
import { useSimplifiedMotion } from '@/hooks/useSimplifiedMotion';
import { usePinnedTimeline } from '@/hooks/usePinnedTimeline';
import { SectionHeading } from './SectionHeading';

interface ChainNode {
  label: string;
  description: string;
}

const NODES: ChainNode[] = [
  { label: 'Contrato', description: 'Assinatura digital, dados do condutor validados.' },
  { label: 'Reserva', description: 'Criada automaticamente para o período do contrato.' },
  { label: 'Viatura', description: 'Alocada e marcada como ocupada.' },
  { label: 'Eventos', description: 'Check-in e check-out agendados no calendário.' },
];

export const LandingContratos = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const simplified = useSimplifiedMotion();

  usePinnedTimeline(sectionRef, simplified, (tl) => {
    if (!cardsRef.current) return;
    const cards = gsap.utils.toArray<HTMLElement>(cardsRef.current.children);
    cards.forEach((card, index) => {
      tl.fromTo(
        card,
        { opacity: 0.25, scale: 0.94, x: -12 },
        { opacity: 1, scale: 1, x: 0, duration: 1, ease: 'power2.out' },
        index
      );
    });
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
          eyebrow="// contratos.cascata"
          title="Um contrato. Quatro passos automáticos."
        >
          Ao assinar, o sistema cria a reserva, aloca a viatura e agenda os eventos — sem um único
          clique extra.
        </SectionHeading>

        <div ref={cardsRef} className="flex flex-col gap-5 border-l-2 border-primary/25 pl-8">
          {NODES.map((node, index) => (
            <div
              key={node.label}
              className="rounded-xl border border-primary/20 bg-card/60 p-6 backdrop-blur-sm"
            >
              <span className="font-mono text-xs text-primary/70">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-2 text-xl font-semibold text-foreground">{node.label}</h3>
              <p className="mt-1 text-base text-muted-foreground">{node.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
