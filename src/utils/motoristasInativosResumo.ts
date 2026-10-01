interface LinhaResumo {
  motorista_id?: string | null;
  liquido: number;
  total_faturado: number;
  saldoPendente?: number;
}

interface ContextoInativos {
  statusAtivoMap: Record<string, boolean>;
  desativadoEmMap: Record<string, string>;
  weekStart: Date;
  /** Por omissão os inativos não aparecem; ligado, voltam para fechar o saldo final. */
  mostrarInativos: boolean;
}

export function ehInativo(
  motoristaId: string | null | undefined,
  statusAtivoMap: Record<string, boolean>
): boolean {
  return !!motoristaId && statusAtivoMap[motoristaId] === false;
}

/**
 * Um inativo só aparece com "Mostrar inativos" ligado — e mesmo assim só nas
 * semanas até à desativação e com valores, para se fechar o saldo de quem saiu.
 */
export function inativoVisivelNoResumo(r: LinhaResumo, ctx: ContextoInativos): boolean {
  if (!ehInativo(r.motorista_id, ctx.statusAtivoMap)) return true;
  if (!ctx.mostrarInativos) return false;
  const desativadoEm = ctx.desativadoEmMap[r.motorista_id as string];
  if (!desativadoEm || new Date(desativadoEm) < ctx.weekStart) return false;
  return r.liquido !== 0 || r.total_faturado !== 0 || (r.saldoPendente ?? 0) !== 0;
}

/** Quantos inativos o interruptor traria de volta nesta semana. */
export function contarInativosEscondidos(
  linhas: readonly LinhaResumo[],
  ctx: Omit<ContextoInativos, 'mostrarInativos'>
): number {
  return linhas.filter(
    (r) =>
      ehInativo(r.motorista_id, ctx.statusAtivoMap) &&
      inativoVisivelNoResumo(r, { ...ctx, mostrarInativos: true })
  ).length;
}
