import type { RefObject } from 'react';
import { gsap, useGSAP } from '@/lib/motion/gsapConfig';

type Timeline = ReturnType<typeof gsap.timeline>;

// pin:true fixa o próprio elemento de trigger. O GSAP cria o pin-spacer
// dele próprio (altura do elemento + distância de scroll) — não precisa
// (nem deve) de um wrapper h-[300vh] à volta a duplicar esse espaço, isso
// faz o spacer ficar mais alto que a secção e invadir a secção seguinte.
export function usePinnedTimeline(
  ref: RefObject<HTMLElement>,
  simplified: boolean,
  build: (tl: Timeline) => void,
  dependencies: unknown[] = []
) {
  useGSAP(
    () => {
      if (simplified || !ref.current) return;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: ref.current,
          pin: true,
          start: 'top top',
          end: () => '+=' + window.innerHeight * 2,
          scrub: 1,
        },
      });
      build(tl);
    },
    { scope: ref, dependencies: [simplified, ...dependencies] }
  );
}
