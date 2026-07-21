import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { SectionHeading } from './SectionHeading';
import { useMagneticHover } from '@/hooks/useMagneticHover';
import { ContactModal } from './ContactModal';

export const LandingHero = () => {
  const prefersReducedMotion = useReducedMotion();
  const primaryRef = useMagneticHover<HTMLAnchorElement>(0.4);
  const secondaryRef = useMagneticHover<HTMLButtonElement>(0.3);

  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center gap-8 px-6">
      <SectionHeading
        eyebrow="// wegest.sistema"
        title="A frota nunca para. O sistema também não devia."
      >
        Contratos, viaturas, motoristas e financeiro. Tudo integrado, sem re-escrever o mesmo dado
        duas vezes.
      </SectionHeading>

      <motion.div
        className="flex flex-col gap-4 sm:flex-row"
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3 }}
      >
        <Link
          ref={primaryRef}
          to="/registar-org"
          className="relative rounded-xl bg-primary px-8 py-4 text-center text-lg font-semibold text-primary-foreground shadow-[0_0_40px_-8px] shadow-primary/50 transition-shadow hover:shadow-primary/70"
        >
          Começar agora
        </Link>
        <ContactModal
          trigger={
            <button
              ref={secondaryRef}
              type="button"
              className="rounded-xl border border-border/50 px-8 py-4 text-center text-lg font-medium text-foreground backdrop-blur-sm transition-colors hover:border-primary/50 hover:bg-card/40"
            >
              Fale conosco
            </button>
          }
        />
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
