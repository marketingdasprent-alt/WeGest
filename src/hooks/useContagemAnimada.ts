import { useEffect, useRef, useState } from 'react';

/**
 * Conta de 0 até `target` e devolve o VALOR — para quem quer renderizar o
 * número em JSX. Respeita prefers-reduced-motion e reanima do zero sempre que
 * `target` muda (ex: depois de um refresh), o que é uma leitura aceitável de
 * "os dados actualizaram-se".
 *
 * Não confundir com `useCountUp` (src/hooks/useCountUp.ts), que faz o mesmo
 * efeito mas devolve uma `ref` e escreve no DOM directamente, para os painéis
 * do site. Os dois existem porque os consumidores são diferentes; o nome
 * distingue-os para não voltarem a colidir.
 */
export function useContagemAnimada(target: number, durationMs = 850): number {
  const [display, setDisplay] = useState(0);
  const prefersReduced = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    if (prefersReduced.current) {
      setDisplay(target);
      return;
    }
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return display;
}
