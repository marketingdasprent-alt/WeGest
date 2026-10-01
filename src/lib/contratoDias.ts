/** Espelha o arredondamento do SQL; intervalos inválidos devolvem 0 para a UI. */
export function contratoDias(inicio?: string | null, fim?: string | null): number {
  if (!inicio || !fim) return 0;
  const ms = new Date(fim).getTime() - new Date(inicio).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 86400000));
}
