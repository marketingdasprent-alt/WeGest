import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { SectionHeading } from './SectionHeading';

export const LandingCTA = () => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <SectionHeading eyebrow="// comecar" title="O seu fluxo começa aqui." />

      <motion.div
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 24 }}
        whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.7, delay: 0.2 }}
      >
        <Link
          to="/registar-org"
          className="rounded-xl bg-primary px-8 py-4 text-lg font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-[1.02]"
        >
          Criar a minha organização
        </Link>
      </motion.div>
    </section>
  );
};
