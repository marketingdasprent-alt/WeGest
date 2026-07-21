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
  const pinRef = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const simplified = useSimplifiedMotion();

  usePinnedTimeline(sectionRef, pinRef, simplified, (tl) => {
    if (!cardsRef.current) return;
    const cards = gsap.utils.toArray<HTMLElement>(cardsRef.current.children);
    cards.forEach((card, index) => {
      tl.fromTo(
        card,
        { opacity: 0.25, scale: 0.92 },
        { opacity: 1, scale: 1, duration: 1, ease: 'power2.out' },
        index
      );
    });
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
        <SectionHeading
          eyebrow="// contratos.cascata"
          title="Um contrato. Quatro passos automáticos."
        >
          Ao assinar, o sistema cria a reserva, aloca a viatura e agenda os eventos — sem um único
          clique extra.
        </SectionHeading>

        <div
          ref={cardsRef}
          className="flex w-full max-w-4xl flex-col gap-4 md:flex-row md:gap-3"
        >
          {NODES.map((node, index) => (
            <div
              key={node.label}
              className="flex-1 rounded-xl border border-primary/20 bg-card/60 p-5 backdrop-blur-sm"
            >
              <span className="font-mono text-xs text-primary/70">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-2 text-lg font-semibold text-foreground">{node.label}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{node.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
