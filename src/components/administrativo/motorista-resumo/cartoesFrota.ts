// Cartões de combustível do motorista, formatados para o resumo.
//
// A fonte é a MESMA da ficha do motorista (MotoristaCartoesFrota): os cartões
// da cartoes_frota ligados ao motorista. O resumo lia antes as colunas de
// texto motoristas_ativos.cartao_bp/repsol/edp/frota — legado que a ficha já
// não escreve (nem limpa no "Devolver"), e que fazia o resumo imprimir
// cartões devolvidos, repetidos ou com número diferente do real.

export type TipoCartaoFrota = 'bp' | 'repsol' | 'edp';

export interface CartaoFrotaResumo {
  numero: string | null;
  tipo: string | null;
}

/** Mesmas etiquetas que a ficha mostra nos badges. */
export const TIPO_CARTAO_LABEL: Record<TipoCartaoFrota, string> = {
  bp: 'BP',
  repsol: 'Repsol',
  edp: 'EDP',
};

const etiqueta = (tipo: string | null): string => {
  const t = (tipo ?? '').toLowerCase() as TipoCartaoFrota;
  return TIPO_CARTAO_LABEL[t] ?? (tipo ?? '').toUpperCase();
};

/**
 * "Repsol 2160 / BP 1136" — ordenado por tipo e depois número, a mesma ordem
 * da ficha, para os dois ecrãs mostrarem a mesma lista pela mesma ordem.
 * Devolve 'N/A' quando o motorista não tem cartões ligados.
 */
export function formatCartoesFrota(cartoes: CartaoFrotaResumo[] | null | undefined): string {
  const validos = (cartoes ?? []).filter((c) => c && c.numero);
  if (!validos.length) return 'N/A';

  return [...validos]
    .sort((a, b) => {
      const porTipo = String(a.tipo ?? '').localeCompare(String(b.tipo ?? ''));
      if (porTipo !== 0) return porTipo;
      return String(a.numero).localeCompare(String(b.numero));
    })
    .map((c) => `${etiqueta(c.tipo)} ${c.numero}`.trim())
    .join(' / ');
}
