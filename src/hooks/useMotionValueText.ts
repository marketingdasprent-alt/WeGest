import { useEffect, useState } from 'react';
import type { MotionValue } from 'framer-motion';

export function useMotionValueText(
  value: MotionValue<number>,
  format: (v: number) => string
): string {
  const [text, setText] = useState(() => format(value.get()));

  useEffect(() => {
    setText(format(value.get()));
    return value.on('change', (latest) => setText(format(latest)));
  }, [value, format]);

  return text;
}
