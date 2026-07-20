import { motion, useScroll, useTransform, type MotionValue } from 'framer-motion';
import { stepIndexFromProgress } from '@/lib/scrollMotion';

interface ScrollRailProps {
  labels: string[];
}

export const ScrollRail = ({ labels }: ScrollRailProps) => {
  const { scrollYProgress } = useScroll();
  const activeIndex = useTransform(scrollYProgress, (p) =>
    stepIndexFromProgress(p, labels.length)
  );

  return (
    <nav
      className="fixed right-6 top-1/2 z-20 hidden -translate-y-1/2 flex-col items-end gap-3 lg:flex"
      aria-hidden="true"
    >
      {labels.map((label, index) => (
        <RailDot key={label} label={label} index={index} activeIndex={activeIndex} />
      ))}
    </nav>
  );
};

interface RailDotProps {
  label: string;
  index: number;
  activeIndex: MotionValue<number>;
}

const RailDot = ({ label, index, activeIndex }: RailDotProps) => {
  const opacity = useTransform(activeIndex, (value) => (value === index ? 1 : 0.35));
  const scale = useTransform(activeIndex, (value) => (value === index ? 1.4 : 1));

  return (
    <div className="flex items-center gap-2">
      <motion.span
        className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
        style={{ opacity }}
      >
        {label}
      </motion.span>
      <motion.span className="h-1.5 w-1.5 rounded-full bg-primary" style={{ opacity, scale }} />
    </div>
  );
};
