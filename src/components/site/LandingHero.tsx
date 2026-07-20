import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { SectionHeading } from './SectionHeading';

export const LandingHero = () => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <SectionHeading
        eyebrow="// wegest.sistema"
        title="A frota nunca pára. O sistema também não devia."
      >
        Contratos, viaturas, motoristas e financeiro — tudo num só fluxo, sem re-escrever o mesmo
        dado duas vezes.
      </SectionHeading>

      <motion.div
        className="flex flex-col gap-3 sm:flex-row"
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3 }}
      >
        <Link
          to="/registar-org"
          className="rounded-xl bg-primary px-6 py-3 text-center font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:scale-[1.02]"
        >
          Começar agora
        </Link>
        <Link
          to="/entrar"
          className="rounded-xl border border-border/50 px-6 py-3 text-center font-medium text-foreground transition-colors hover:border-primary/50"
        >
          Já é cliente? Entrar
        </Link>
      </motion.div>

      {!prefersReducedMotion && (
        <motion.div
          className="absolute bottom-8 flex flex-col items-center gap-2 text-muted-foreground/70"
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span className="text-xs uppercase tracking-widest">scroll</span>
          <ChevronDown className="h-4 w-4" />
        </motion.div>
      )}
    </section>
  );
};
