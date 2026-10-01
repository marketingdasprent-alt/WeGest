export const COR_RECOLHA = '#D50000';

export const COR_ENTREGA = '#009640';

export const COR_DEVOLUCAO = '#0050C8';

export const TAMANHO_MOMENTO_PT = 20;

export const COR_NEUTRA = '#000000';

const CORES: Record<string, string> = {
  ENTREGA: COR_ENTREGA,
  RECOLHA: COR_RECOLHA,
  DEVOLUÇÃO: COR_DEVOLUCAO,
  DEVOLUCAO: COR_DEVOLUCAO,
};

export function corDoMomentoFolha(momento: string | null | undefined): string {
  if (!momento) return COR_NEUTRA;
  return CORES[momento.trim().toUpperCase()] ?? COR_NEUTRA;
}

export function momentoFolhaHtml(momento: string | null | undefined): string {
  if (!momento) return '';
  const cor = corDoMomentoFolha(momento);
  return `<strong style="color:${cor};font-size:${TAMANHO_MOMENTO_PT}px">${momento}</strong>`;
}
