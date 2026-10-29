import {
  calcularRetencao,
  levaCorteSeisPorCento,
  type RetencaoIrs,
  type TaxasRetencao,
} from './retencaoIrs';

export interface ResumoFinanceiroInput {
  isImportado: boolean;
  reciboVerde: boolean;
  /** Taxas de IVA e IRS do motorista com Retenção; null/omisso = sem Retenção. */
  retencao?: TaxasRetencao | null;
  receitas: { bolt: number; uber: number; outras_receitas: number };
  gorjetaBolt: number;
  gorjetaUber: number;
  totalDespesas: number;
  valoresSemanaAnterior: number;
  liquidoImportado: number;
}

export interface ResumoFinanceiroResult {
  gorjeta: number;
  totalReceitas: number;
  /** Mantém o bruto por plataforma igual ao valor mostrado na lista de Contas/Resumo. */
  receitasExibidas: { bolt: number; uber: number; outras_receitas: number };
  receitaAjustada: number;
  totalAReceber: number;
  liquido: number;
  /** Linhas de IVA e IRS, só para motoristas com Retenção. */
  retencao: RetencaoIrs | null;
}

export function deriveResumoFinanceiro(input: ResumoFinanceiroInput): ResumoFinanceiroResult {
  const {
    isImportado,
    reciboVerde,
    retencao = null,
    receitas,
    gorjetaBolt,
    gorjetaUber,
    totalDespesas,
    valoresSemanaAnterior,
    liquidoImportado,
  } = input;

  // No recibo importado o líquido já vem fechado — a gorjeta não se aplica.
  const gBolt = isImportado ? 0 : gorjetaBolt;
  const gUber = isImportado ? 0 : gorjetaUber;
  const gorjeta = gBolt + gUber;
  const totalReceitas = receitas.bolt + receitas.uber + receitas.outras_receitas;

  // Os 6% só incidem sobre a base; a gorjeta já está faturada e não é dividida.
  const cortaSeis = !isImportado && levaCorteSeisPorCento(reciboVerde, !!retencao);

  const ajustarBase = (total: number, gorjetaPlataforma: number) =>
    cortaSeis ? (total - gorjetaPlataforma) / 1.06 + gorjetaPlataforma : total;

  const boltExibido = ajustarBase(receitas.bolt, gBolt);
  const uberExibido = ajustarBase(receitas.uber, gUber);

  // O corte de 6% é apresentado em linha própria, preservando o bruto por plataforma.
  const receitasExibidas = {
    bolt: receitas.bolt,
    uber: receitas.uber,
    outras_receitas: receitas.outras_receitas,
  };

  const receitaAjustada = isImportado
    ? totalReceitas
    : boltExibido + uberExibido + receitas.outras_receitas;

  // IVA e IRS só sobre o serviço desta semana; o saldo anterior soma-se depois.
  const contasRetencao =
    !isImportado && retencao ? calcularRetencao(receitaAjustada - totalDespesas, retencao) : null;

  // A gorjeta já integra `receitaAjustada`; somá-la aqui duplicaria o valor.
  const totalAReceber = isImportado
    ? liquidoImportado
    : contasRetencao
      ? contasRetencao.totalAReceber + valoresSemanaAnterior
      : receitaAjustada - totalDespesas + valoresSemanaAnterior;

  const liquido = isImportado ? liquidoImportado : totalAReceber;

  return {
    gorjeta,
    totalReceitas,
    receitasExibidas,
    receitaAjustada,
    totalAReceber,
    liquido,
    retencao: contasRetencao,
  };
}
