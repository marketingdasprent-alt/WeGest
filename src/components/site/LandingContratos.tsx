import { useRef } from 'react';
import { motion, useScroll, useTransform, useMotionValue, type MotionValue } from 'framer-motion';
import { useSimplifiedMotion } from '@/hooks/useSimplifiedMotion';
import { stepIndexFromProgress } from '@/lib/scrollMotion';
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
  const sectionRef = useRef<HTMLDivElement>(null);
  const simplified = useSimplifiedMotion();
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
  });

  const scrollDriven = useTransform(scrollYProgress, (p) => stepIndexFromProgress(p, NODES.length));
  const staticValue = useMotionValue(NODES.length - 1);
  const activeIndex = simplified ? staticValue : scrollDriven;

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
        <SectionHeading
          eyebrow="// contratos.cascata"
          title="Um contrato. Quatro passos automáticos."
        >
          Ao assinar, o sistema cria a reserva, aloca a viatura e agenda os eventos — sem um único
          clique extra.
        </SectionHeading>

        <div className="flex w-full max-w-4xl flex-col gap-4 md:flex-row md:gap-3">
          {NODES.map((node, index) => (
            <ChainNodeCard key={node.label} node={node} index={index} activeIndex={activeIndex} />
          ))}
        </div>
      </div>
    </section>
  );
};

interface ChainNodeCardProps {
  node: ChainNode;
  index: number;
  activeIndex: MotionValue<number>;
}

const ChainNodeCard = ({ node, index, activeIndex }: ChainNodeCardProps) => {
  const opacity = useTransform(activeIndex, (value) => (value >= index ? 1 : 0.35));

  return (
    <motion.div
      className="flex-1 rounded-xl border border-primary/20 bg-card/60 p-5 backdrop-blur-sm"
      style={{ opacity }}
    >
      <span className="font-mono text-xs text-primary/70">
        {String(index + 1).padStart(2, '0')}
      </span>
      <h3 className="mt-2 text-lg font-semibold text-foreground">{node.label}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{node.description}</p>
    </motion.div>
  );
};
