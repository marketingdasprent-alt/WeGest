import { useRef, type RefObject } from 'react';
import { gsap, useGSAP } from '@/lib/motion/gsapConfig';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const REDUCED = '(prefers-reduced-motion: reduce)';
const FULL = '(prefers-reduced-motion: no-preference)';

/**
 * Revela `[data-reveal]` do container ao entrar no viewport. `opacity: 0` é
 * aplicado por JS (não CSS) para o conteúdo ficar legível sem JS/GSAP.
 * `desordenado` é intencional nalgumas secções (ver ReconhecimentoSection).
 */
export function useRevealOnScroll<T extends HTMLElement>(options?: {
  /** Segundos entre cada elemento. */
  stagger?: number;
  /** Deslocamento vertical inicial, em px. */
  distancia?: number;
  /** Ordem aleatória mas estável — encena dispersão. */
  desordenado?: boolean;
}): RefObject<T> {
  const ref = useRef<T>(null);
  const { stagger = 0.08, distancia = 20, desordenado = false } = options ?? {};

  useGSAP(
    () => {
      const container = ref.current;
      if (!container) return;

      const alvos = gsap.utils.toArray<HTMLElement>('[data-reveal]', container);
      if (alvos.length === 0) return;

      const mm = gsap.matchMedia();

      mm.add(FULL, () => {
        const tween = gsap.from(alvos, {
          opacity: 0,
          y: distancia,
          duration: 0.55,
          ease: 'power2.out',
          stagger: desordenado ? { each: stagger, from: 'random' } : stagger,
          scrollTrigger: {
            trigger: container,
            start: 'top 80%',
            once: true,
          },
        });
        return () => tween.kill();
      });

      // Reduced motion: garante o estado final explicitamente, sem transição.
      mm.add(REDUCED, () => {
        gsap.set(alvos, { opacity: 1, y: 0, clearProps: 'transform' });
      });

      return () => mm.revert();
    },
    { scope: ref, dependencies: [stagger, distancia, desordenado] }
  );

  return ref;
}
