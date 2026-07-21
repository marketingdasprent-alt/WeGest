import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { SectionHeading } from './SectionHeading';
import { useMagneticHover } from '@/hooks/useMagneticHover';

export const LandingCTA = () => {
  const prefersReducedMotion = useReducedMotion();
  const ctaRef = useMagneticHover<HTMLAnchorElement>(0.4);

  return (
    <section className="relative flex flex-col items-center gap-8 px-6 py-32">
      <SectionHeading eyebrow="// comecar" title="O seu fluxo começa aqui." />

      <motion.div
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 24 }}
        whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.6 }}
        transition={{ duration: 0.7, delay: 0.2 }}
      >
        <Link
          ref={ctaRef}
          to="/registar-org"
          className="relative rounded-xl bg-primary px-10 py-5 text-lg font-semibold text-primary-foreground shadow-[0_0_50px_-10px] shadow-primary/60 transition-shadow hover:shadow-primary/80"
        >
          Criar a minha organização
        </Link>
      </motion.div>
    </section>
  );
};
