import { useRef, type RefObject } from 'react';
import { gsap, useGSAP } from '@/lib/motion/gsapConfig';
import { useSimplifiedMotion } from '@/hooks/useSimplifiedMotion';

export function useMagneticHover<T extends HTMLElement>(
  strength = 0.35
): RefObject<T> {
  const ref = useRef<T>(null);
  const simplified = useSimplifiedMotion();

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || simplified) return;

      const moveX = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3' });
      const moveY = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3' });

      const handleMove = (event: MouseEvent) => {
        const rect = el.getBoundingClientRect();
        moveX((event.clientX - (rect.left + rect.width / 2)) * strength);
        moveY((event.clientY - (rect.top + rect.height / 2)) * strength);
      };

      const handleLeave = () => {
        moveX(0);
        moveY(0);
      };

      el.addEventListener('mousemove', handleMove);
      el.addEventListener('mouseleave', handleLeave);

      return () => {
        el.removeEventListener('mousemove', handleMove);
        el.removeEventListener('mouseleave', handleLeave);
      };
    },
    { scope: ref, dependencies: [simplified, strength] }
  );

  return ref;
}
