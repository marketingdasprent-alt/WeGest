import { useEffect, useRef, useState } from 'react';

interface UseInViewOnceResult<T extends HTMLElement> {
  ref: React.RefObject<T>;
  inView: boolean;
}

export function useInViewOnce<T extends HTMLElement>(threshold = 0.4): UseInViewOnceResult<T> {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, threshold]);

  return { ref, inView };
}
