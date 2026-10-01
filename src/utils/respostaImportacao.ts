/** O que um importador respondeu, no mesmo formato para todas as plataformas. */
export interface ResultadoImportacao {
  gravados: number;
  lidas: number;
  ignoradas: number;
  deduplicadas: number;
  erros: number;
  semTitular: number;
  substituidas: number;
  periodo: string | null;
  colunas: string[];
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Cada importador responde à sua maneira (bolt: imported; uber: inserted+updated; …). */
export function resumirRespostaImportacao(data: Record<string, unknown>): ResultadoImportacao {
  const inseridosOuActualizados = num(data.inserted) + num(data.updated);
  const gravados =
    (typeof data.imported === 'number' ? data.imported : undefined) ??
    (inseridosOuActualizados > 0 ? inseridosOuActualizados : undefined) ??
    (typeof data.processados === 'number' ? data.processados : undefined) ??
    (typeof data.total_imported === 'number' ? data.total_imported : undefined) ??
    num(data.matched);
  const erros = Array.isArray(data.errors) ? data.errors.length : num(data.errors ?? data.erros);
  return {
    gravados,
    lidas: num(data.total_rows ?? data.total) || gravados,
    ignoradas: num(data.skipped),
    deduplicadas: num(data.deduped_in_payload),
    erros,
    semTitular: num(data.sem_titular),
    substituidas: num(data.substituidas),
    periodo: typeof data.periodo === 'string' ? data.periodo : null,
    colunas: Array.isArray(data.debug_headers) ? (data.debug_headers as string[]) : [],
  };
}
