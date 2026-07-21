import { motion, useReducedMotion } from 'framer-motion';
import { SectionHeading } from './SectionHeading';

const MODULOS = [
  { label: 'TVDE', description: 'Motoristas, candidaturas, documentação e conformidade.' },
  { label: 'Rent-a-Car', description: 'Contratos, reservas, tarifas e grupos de viaturas.' },
  { label: 'Assistência', description: 'Tickets, reparações e acompanhamento de sinistros.' },
  { label: 'Frota', description: 'Viaturas, combustíveis, danos e documentos.' },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const blockVariants = {
  hidden: { opacity: 0, y: 24, scale: 0.96 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

export const LandingModulos = () => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center gap-10 px-6 py-24">
      <SectionHeading eyebrow="// modulos.activaveis" title="Liga só o que precisas.">
        TVDE, Rent-a-Car, Assistência, Frota — cada módulo entra quando a operação pede, não
        antes.
      </SectionHeading>

      <motion.div
        className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2"
        initial={prefersReducedMotion ? undefined : 'hidden'}
        whileInView={prefersReducedMotion ? undefined : 'visible'}
        viewport={{ once: true, amount: 0.4 }}
        variants={prefersReducedMotion ? undefined : containerVariants}
      >
        {MODULOS.map((modulo) => (
          <motion.div
            key={modulo.label}
            variants={prefersReducedMotion ? undefined : blockVariants}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="rounded-xl border border-border/50 bg-card/60 p-5 backdrop-blur-sm"
          >
            <h3 className="text-lg font-semibold text-foreground">{modulo.label}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{modulo.description}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
};
