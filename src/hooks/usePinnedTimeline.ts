import type { RefObject } from 'react';
import { gsap, useGSAP } from '@/lib/motion/gsapConfig';

type Timeline = ReturnType<typeof gsap.timeline>;

export function usePinnedTimeline(
  sectionRef: RefObject<HTMLElement>,
  pinRef: RefObject<HTMLElement>,
  simplified: boolean,
  build: (tl: Timeline) => void,
  dependencies: unknown[] = []
) {
  useGSAP(
    () => {
      if (simplified || !sectionRef.current || !pinRef.current) return;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          pin: pinRef.current,
          start: 'top top',
          scrub: 1,
        },
      });
      build(tl);
    },
    { scope: sectionRef, dependencies: [simplified, ...dependencies] }
  );
}
