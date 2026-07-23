import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

const MOBILE_QUERY = '(max-width: 767px)';

export function useSimplifiedMotion(): boolean {
  const prefersReducedMotion = useReducedMotion();
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
  );

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  }, []);

  return Boolean(prefersReducedMotion) || isMobile;
}
