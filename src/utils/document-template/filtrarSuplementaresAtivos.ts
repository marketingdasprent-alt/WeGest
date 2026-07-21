interface SuplementarFiltravel {
  ativo: boolean;
  empresaIds: string[];
}

/** Documentos suplementares ativos e associados à empresa indicada. */
export function filtrarSuplementaresAtivos<T extends SuplementarFiltravel>(
  suplementares: T[],
  empresaId: string
): T[] {
  return suplementares.filter((s) => s.ativo && s.empresaIds.includes(empresaId));
}
