import { motion, useReducedMotion } from 'framer-motion';
import { SectionHeading } from './SectionHeading';

interface Stat {
  value: string;
  label: string;
}

const STATS: Stat[] = [
  { value: '500+', label: 'Motoristas ativos' },
  { value: '200+', label: 'Viaturas em frota' },
  { value: '5', label: 'Anos de operação' },
  { value: '24/7', label: 'Suporte disponível' },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const statVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export const LandingStats = () => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative flex flex-col items-center gap-10 px-6 py-24">
      <SectionHeading eyebrow="// a.nossa.operação" title="Testado na nossa própria frota.">
        Antes de o vender, usamos este sistema para gerir a nossa própria operação de TVDE e
        rent-a-car todos os dias.
      </SectionHeading>

      <motion.div
        className="grid w-full max-w-4xl grid-cols-2 gap-6 md:grid-cols-4"
        initial={prefersReducedMotion ? undefined : 'hidden'}
        whileInView={prefersReducedMotion ? undefined : 'visible'}
        viewport={{ once: true, amount: 0.5 }}
        variants={prefersReducedMotion ? undefined : containerVariants}
      >
        {STATS.map((stat) => (
          <motion.div
            key={stat.label}
            variants={prefersReducedMotion ? undefined : statVariants}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="flex flex-col items-center gap-1 text-center"
          >
            <span className="text-4xl font-bold text-primary">{stat.value}</span>
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              {stat.label}
            </span>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
};
