import { motion, useReducedMotion } from 'framer-motion';
import { SectionHeading } from './SectionHeading';

const FRAGMENTS = [
  { label: 'contrato.pdf', rotate: -8, top: '14%', left: '12%' },
  { label: 'financeiro.xlsx', rotate: 6, top: '18%', left: '80%' },
  { label: 'grupo WhatsApp', rotate: -4, top: '72%', left: '14%' },
  { label: 'calendário em papel', rotate: 9, top: '78%', left: '82%' },
  { label: 'notas.docx', rotate: 5, top: '48%', left: '6%' },
  { label: 'SMS ao motorista', rotate: -6, top: '10%', left: '48%' },
  { label: 'Excel de tarifas', rotate: 3, top: '88%', left: '50%' },
  { label: 'ficheiro partilhado', rotate: -3, top: '50%', left: '92%' },
];

export const LandingProblema = () => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center gap-10 overflow-hidden px-6 py-24">
      <div className="absolute inset-0" aria-hidden="true">
        {FRAGMENTS.map((fragment, index) => (
          <motion.div
            key={fragment.label}
            className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg border border-border/40 bg-card/50 px-4 py-3 font-mono text-xs text-muted-foreground backdrop-blur-sm"
            style={{ top: fragment.top, left: fragment.left, rotate: fragment.rotate }}
            initial={prefersReducedMotion ? undefined : { opacity: 0, scale: 0.8 }}
            whileInView={prefersReducedMotion ? undefined : { opacity: 0.7, scale: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.7, delay: index * 0.08 }}
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
