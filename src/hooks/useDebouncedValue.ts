import { useEffect, useState } from 'react';

/**
 * Devolve um valor debounced — só actualiza após `delay` ms sem mudanças.
 *
 * Útil para inputs de pesquisa onde não queremos disparar uma query a cada keystroke.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
