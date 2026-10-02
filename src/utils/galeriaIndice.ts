/** Índice vizinho numa galeria, a dar a volta nas pontas (última → primeira). */
export function indiceVizinho(atual: number, total: number, passo: 1 | -1): number {
  if (total <= 0) return 0;
  return (((atual + passo) % total) + total) % total;
}
