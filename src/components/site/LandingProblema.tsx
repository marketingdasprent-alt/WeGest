import { motion, useReducedMotion } from 'framer-motion';
import { SectionHeading } from './SectionHeading';

const FRAGMENTS = [
  { label: 'contrato.pdf', rotate: -8, x: '-30%', y: '-10%' },
  { label: 'financeiro.xlsx', rotate: 6, x: '25%', y: '-18%' },
  { label: 'grupo WhatsApp', rotate: -4, x: '-20%', y: '20%' },
  { label: 'calendário em papel', rotate: 9, x: '30%', y: '15%' },
];

export const LandingProblema = () => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center gap-10 overflow-hidden px-6 py-24">
      <div className="relative h-48 w-full max-w-md">
        {FRAGMENTS.map((fragment, index) => (
          <motion.div
            key={fragment.label}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border/40 bg-card/50 px-4 py-3 font-mono text-xs text-muted-foreground backdrop-blur-sm"
            style={{ rotate: fragment.rotate }}
            initial={prefersReducedMotion ? undefined : { opacity: 0, x: 0, y: 0 }}
            whileInView={
              prefersReducedMotion ? undefined : { opacity: 0.85, x: fragment.x, y: fragment.y }
            }
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.8, delay: index * 0.1 }}
          >
            {fragment.label}
          </motion.div>
        ))}
      </div>

      <SectionHeading
        eyebrow="// antes.do.wegest"
        title="Cada viatura vive em três sítios diferentes."
      >
        Contrato em papel. Excel para o financeiro. WhatsApp para tudo o resto — e nenhum fala com
        o outro.
      </SectionHeading>
    </section>
  );
};
