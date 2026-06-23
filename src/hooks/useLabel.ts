import { useMemo } from 'react';
import { useModules } from '@/hooks/useModules';
import { resolveLabel } from '@/lib/labels';

/**
 * Resolve uma label neutra para o vocabulário da organização actual.
 *
 * Ex.: `useLabel('cliente.singular')` →
 *   - "Cliente" em org com `aluguer` activo
 *   - "Motorista parceiro" em org só-TVDE
 *
 * As regras vivem em [src/lib/labels.ts](src/lib/labels.ts).
 */
export function useLabel(key: string): string {
  const { activos } = useModules();
  return useMemo(() => resolveLabel(key, activos), [key, activos]);
}

/**
 * Variante que resolve várias labels de uma vez (evita N chamadas ao hook).
 */
export function useLabels<K extends string>(keys: readonly K[]): Record<K, string> {
  const { activos } = useModules();
  return useMemo(() => {
    const out = {} as Record<K, string>;
    for (const k of keys) out[k] = resolveLabel(k, activos);
    return out;
  }, [keys, activos]);
}
