import { Fragment, useEffect, useMemo } from 'react';
import { useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { createTimeline, stagger } from 'animejs';
import { useInViewOnce } from '@/hooks/useInViewOnce';

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  align?: 'center' | 'left';
}

export const SectionHeading = ({
  eyebrow,
  title,
  children,
  align = 'center',
}: SectionHeadingProps) => {
  const prefersReducedMotion = useReducedMotion();
  const alignment = align === 'center' ? 'items-center text-center' : 'items-start text-left';
  const words = useMemo(() => title.split(' '), [title]);
  const { ref: containerRef, inView } = useInViewOnce<HTMLDivElement>();

  useEffect(() => {
    if (!inView || prefersReducedMotion || !containerRef.current) return;

    const eyebrowEl = containerRef.current.querySelector('[data-eyebrow]');
    const wordEls = containerRef.current.querySelectorAll('[data-word]');
    const bodyEl = containerRef.current.querySelector('[data-body]');

    const tl = createTimeline({ defaults: { ease: 'outExpo' } });
    if (eyebrowEl) {
      tl.add(eyebrowEl, { opacity: [0, 1], translateY: [10, 0], duration: 500 });
    }
    tl.add(
      wordEls,
      { opacity: [0, 1], translateY: [28, 0], duration: 700, delay: stagger(45) },
      '-=350'
    );
    if (bodyEl) {
      tl.add(bodyEl, { opacity: [0, 1], translateY: [12, 0], duration: 500 }, '-=350');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, prefersReducedMotion]);

  return (
    <div ref={containerRef} className={`flex max-w-3xl flex-col gap-5 ${alignment}`}>
      <span
        data-eyebrow
        className={`font-mono text-xs uppercase tracking-[0.3em] text-primary/70 ${
          prefersReducedMotion ? '' : 'opacity-0'
        }`}
      >
        {eyebrow}
      </span>
      <h2 className="text-5xl font-bold leading-[1.05] tracking-tight text-foreground md:text-6xl lg:text-7xl">
        {words.map((word, index) => (
          // O espaço fica fora do <span data-word> de propósito: dentro de
          // um inline-block, o browser colapsa espaço junto à borda da caixa.
          <Fragment key={`${word}-${index}`}>
            <span
              data-word
              className={`inline-block will-change-transform ${
                prefersReducedMotion ? '' : 'opacity-0'
              }`}
            >
              {word}
            </span>
            {index < words.length - 1 ? ' ' : ''}
          </Fragment>
        ))}
      </h2>
      {children && (
        <div
          data-body
          className={`max-w-xl text-lg text-muted-foreground md:text-xl ${
            prefersReducedMotion ? '' : 'opacity-0'
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
};
