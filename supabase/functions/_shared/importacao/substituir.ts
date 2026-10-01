/**
 * Período "YYYYMMDD-YYYYMMDD" de uma importação Uber: o que vem no pedido,
 * senão o do nome do ficheiro. É o sufixo das chaves que o importador grava
 * (`<uuid>-<período>`) e o que diz que semana substituir.
 */
export function periodoUberDaImportacao(
  inicio?: string | null,
  fim?: string | null,
  nomeFicheiro?: string | null,
): string | null {
  if (inicio && fim) return `${inicio.replace(/-/g, '')}-${fim.replace(/-/g, '')}`;
  const m = nomeFicheiro?.match(/(\d{8})-(\d{8})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

/** Valores únicos e não vazios, pela ordem em que aparecem. */
export function unicos(valores: ReadonlyArray<string | null | undefined>): string[] {
  return [...new Set(valores.filter((v): v is string => !!v))];
}
