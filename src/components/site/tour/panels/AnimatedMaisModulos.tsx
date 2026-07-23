import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { MAIS_MODULOS } from '../tourData';
import { staggerContainer, staggerItem } from '../motionVariants';
import { useTourNavigation } from '../TourNavigationContext';

export const AnimatedMaisModulos = () => {
  const { goToContact } = useTourNavigation();

  return (
    <div className="flex h-full flex-col items-center justify-center overflow-y-auto px-8 py-10 text-center">
      <span className="font-mono text-xs uppercase tracking-[0.3em] text-primary/70">
        // e.não.para.aqui
      </span>
      <h2 className="mt-4 max-w-xl font-display text-3xl font-semibold leading-tight text-foreground md:text-4xl">
        Percorreu 8 módulos. O WeGest tem muito mais.
      </h2>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        Esta demonstração mostra o essencial — a sua operação real ganha acesso a tudo isto também.
      </p>

      <motion.div
        className="mt-8 grid max-w-2xl grid-cols-2 gap-2.5 sm:grid-cols-3"
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
      >
        {MAIS_MODULOS.map((modulo) => {
          const Icon = modulo.icon;
          return (
            <motion.div
              key={modulo.label}
              variants={staggerItem}
              className="flex items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2.5 text-left text-xs font-medium text-muted-foreground"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
              {modulo.label}
            </motion.div>
          );
        })}
      </motion.div>

      <button
        type="button"
        onClick={goToContact}
        className="mt-8 flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-base font-medium text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20"
      >
        Quero isto na minha empresa
        <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
};
