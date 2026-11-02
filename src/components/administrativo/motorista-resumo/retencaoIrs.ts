// Motorista com Retenção: passa fatura-recibo com IVA e a empresa retém IRS
// (fica com ela e entrega às Finanças). Conta da folha da equipa, 2026-10-23.
// As taxas são da ficha de cada motorista; por omissão 23% e 23%.

/** Taxas em fração (0.23 = 23%). */
export interface TaxasRetencao {
  iva: number;
  irs: number;
}

export const TAXAS_RETENCAO_OMISSAO: TaxasRetencao = { iva: 0.23, irs: 0.23 };

interface FichaRetencao {
  retencao_irs?: boolean | null;
  retencao_iva_pct?: number | null;
  retencao_irs_pct?: number | null;
}

/** Taxas da ficha (em %, ex.: 23) ou null se o motorista não tem Retenção. */
export function taxasRetencaoDaFicha(ficha: FichaRetencao): TaxasRetencao | null {
  if (ficha.retencao_irs !== true) return null;
  const fracao = (pct: number | null | undefined, omissao: number) =>
    pct == null || !Number.isFinite(Number(pct)) ? omissao : Number(pct) / 100;
  return {
    iva: fracao(ficha.retencao_iva_pct, TAXAS_RETENCAO_OMISSAO.iva),
    irs: fracao(ficha.retencao_irs_pct, TAXAS_RETENCAO_OMISSAO.irs),
  };
}

export interface RetencaoIrs {
  /** Ganhos da semana (já sem os 6%) menos os custos: a base da fatura-recibo. */
  totalLiquido: number;
  taxaIva: number;
  iva: number;
  /** O que a fatura-recibo do motorista soma: Total líquido + IVA. */
  totalDocumento: number;
  taxaIrs: number;
  /** Retido pela empresa. */
  irs: number;
  totalAReceber: number;
}

const arredondar = (valor: number) => Math.round(valor * 100) / 100;

/** Aplica-se mesmo com o Total líquido negativo (decisão de 2026-10-23). */
export function calcularRetencao(
  totalLiquido: number,
  taxas: TaxasRetencao = TAXAS_RETENCAO_OMISSAO
): RetencaoIrs {
  const base = arredondar(totalLiquido);
  const iva = arredondar(base * taxas.iva);
  const irs = arredondar(base * taxas.irs);
  const totalDocumento = arredondar(base + iva);
  return {
    totalLiquido: base,
    taxaIva: taxas.iva,
    iva,
    totalDocumento,
    taxaIrs: taxas.irs,
    irs,
    totalAReceber: arredondar(totalDocumento - irs),
  };
}

/** 0.23 → "23%", 0.115 → "11,5%", para os rótulos das linhas de IVA e IRS. */
export const percentagem = (taxa: number) =>
  `${(taxa * 100).toLocaleString('pt-PT', { maximumFractionDigits: 2 })}%`;

/** Os 6% saem a quem não passa recibo verde e a quem tem Retenção. */
export function levaCorteSeisPorCento(reciboVerde: boolean, retencao: boolean): boolean {
  return !reciboVerde || retencao;
}

/** Corte de quem não passa recibo: 6% no continente; nos Açores a ficha diz 4%. */
export const CORTE_SEM_RECIBO_OMISSAO = 0.06;

/** Taxa do corte da ficha (corte_sem_recibo_pct, em %), em fração. */
export function corteSemReciboDaFicha(ficha: {
  corte_sem_recibo_pct?: number | string | null;
}): number {
  const pct = Number(ficha.corte_sem_recibo_pct);
  return ficha.corte_sem_recibo_pct == null || !Number.isFinite(pct)
    ? CORTE_SEM_RECIBO_OMISSAO
    : pct / 100;
}

/** Por quanto se dividem os ganhos das plataformas: 1 sem corte, 1,06 ou 1,04 com ele. */
export function divisorCorte(
  reciboVerde: boolean,
  retencao: boolean,
  corte: number = CORTE_SEM_RECIBO_OMISSAO
): number {
  return levaCorteSeisPorCento(reciboVerde, retencao) ? 1 + corte : 1;
}
