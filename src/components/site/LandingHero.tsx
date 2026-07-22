import { motion, useReducedMotion } from 'framer-motion';
import { useThemedLogo } from '@/hooks/useThemedLogo';
import { useMagneticHover } from '@/hooks/useMagneticHover';

interface LandingHeroProps {
  onContactClick?: () => void;
}

// Hero minimalista de propósito: o produto começa logo a seguir. Nada de
// separação grande entre esta secção e o tour — o visitante deve sentir que
// "entrou" no WeGest quase de imediato.
//
// O CTA é "Fale connosco", não "Criar organização": não há self-serve —
// a organização só é criada depois de assinar connosco.
export const LandingHero = ({ onContactClick }: LandingHeroProps) => {
  const prefersReducedMotion = useReducedMotion();
  const logoSrc = useThemedLogo();
  const ctaRef = useMagneticHover<HTMLButtonElement>(0.35);

  return (
    <section className="relative flex min-h-[70vh] flex-col items-center justify-center gap-6 px-6 py-20 text-center">
      <motion.img
        src={logoSrc}
        alt="WeGest"
        className="h-14 w-auto object-contain"
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      />

      <motion.h1
        className="font-display text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.02em] text-foreground md:text-6xl"
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        O software que já gere a nossa própria frota.
      </motion.h1>

      <motion.p
        className="max-w-lg text-pretty text-lg text-muted-foreground"
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        Desça e navegue o WeGest a sério — os mesmos ecrãs que a sua equipa vai usar todos os dias.
      </motion.p>

      <motion.div
        initial={prefersReducedMotion ? undefined : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        <button
          ref={ctaRef}
          type="button"
          onClick={onContactClick}
          className="rounded-md bg-primary px-6 py-3 text-center text-base font-medium text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/20"
        >
          Fale connosco
        </button>
      </motion.div>
    </section>
  );
};
