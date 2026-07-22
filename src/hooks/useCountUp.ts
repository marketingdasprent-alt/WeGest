import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { animate } from 'animejs';

/**
 * Anima um <span> de 0 até `value` a partir do mount. Os painéis do tour só
 * são montados quando se tornam o módulo ativo (ver LandingTour), por isso
 * "no mount" já significa "ao entrar neste módulo" — e repete sempre que o
 * visitante volta a passar por ele.
 */
export function useCountUp(value: number, formatter?: (n: number) => string) {
  const ref = useRef<HTMLSpanElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const format = formatter ?? ((n: number) => String(Math.round(n)));

    if (prefersReducedMotion) {
      node.textContent = format(value);
      return;
    }

    const state = { value: 0 };
    const anim = animate(state, {
      value,
      duration: 900,
      ease: 'outExpo',
      onUpdate: () => {
        node.textContent = format(state.value);
      },
    });

    return () => anim.pause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}
