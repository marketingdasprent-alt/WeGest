/**
 * Escalões de retentativa da emissão fiscal.
 * Nunca há retry infinito contra uma API fiscal: ao esgotar, um humano decide.
 *
 * TypeScript puro, sem APIs de Deno de propósito — assim o worker (Deno) e os
 * testes (Vitest) partilham a MESMA definição, em vez de duas cópias que
 * divergem em silêncio.
 */
export const BACKOFF_SEGUNDOS = [60, 300, 900, 3600, 21600] as const;

/** `tentativas` é o número de tentativas JÁ feitas. Null = esgotou. */
export function proximaTentativa(tentativas: number, agora: Date): Date | null {
  const s = BACKOFF_SEGUNDOS[tentativas - 1];
  if (s === undefined) return null;
  return new Date(agora.getTime() + s * 1000);
}
