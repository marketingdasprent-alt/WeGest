import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

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

  return (
    <motion.div
      className={`flex max-w-2xl flex-col gap-4 ${alignment}`}
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 24 }}
      whileInView={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <span className="font-mono text-xs uppercase tracking-widest text-primary/70">
        {eyebrow}
      </span>
      <h2 className="text-4xl font-bold text-foreground md:text-5xl">{title}</h2>
      {children && <div className="text-base text-muted-foreground md:text-lg">{children}</div>}
    </motion.div>
  );
};
