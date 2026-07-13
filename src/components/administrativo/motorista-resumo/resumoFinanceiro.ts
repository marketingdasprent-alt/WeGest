/**
 * Cálculo puro do resumo financeiro do motorista (receitas, receita ajustada,
 * total a receber e líquido). Extraído de MotoristaResumoDialog para ser
 * testável e evitar regressões de contagem dupla.
 *
 * Regra da gorjeta: a gorjeta é **por plataforma** (Bolt / Uber) e entra na
 * linha da própria plataforma — Uber exibido = uber + gorjetaUber, Bolt = bolt
 * + gorjetaBolt. NÃO é uma linha separada e NÃO passa pela divisão de recibo
 * verde (÷1.06): só a base uber/bolt sofre os 6%, a gorjeta soma-se depois.
 * Assim a gorjeta entra uma única vez e o líquido nunca fica maior que a
 * receita (bug real 13/07: 522,65 de receita → 536,40 de líquido).
 */
export interface ResumoFinanceiroInput {
  isImportado: boolean;
  reciboVerde: boolean;
  receitas: { bolt: number; uber: number; outras_receitas: number };
  gorjetaBolt: number;
  gorjetaUber: number;
  totalDespesas: number;
  valoresSemanaAnterior: number;
  /** Líquido pré-calculado do recibo importado — usado quando `isImportado`. */
  liquidoImportado: number;
}

export interface ResumoFinanceiroResult {
  gorjeta: number;
  totalReceitas: number;
  /** Receitas para exibição, já com a gorjeta embutida por plataforma e o
   *  ajuste de recibo verde aplicado à base. Somam sempre à receita mostrada. */
  receitasExibidas: { bolt: number; uber: number; outras_receitas: number };
  receitaAjustada: number;
  totalAReceber: number;
  liquido: number;
}

export function deriveResumoFinanceiro(input: ResumoFinanceiroInput): ResumoFinanceiroResult {
  const {
    isImportado,
    reciboVerde,
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

  // Os 6% (÷1.06) só se aplicam quando NÃO há recibo verde e não é importado.
  // A gorjeta NUNCA é dividida: o faturado_uber/bolt já inclui a gorjeta, por
  // isso extraímos a gorjeta antes de aplicar ÷1.06 e somamo-la de volta.
  const semReciboVerde = !isImportado && !reciboVerde;

  const ajustarBase = (total: number, gorjetaPlataforma: number) =>
    semReciboVerde ? (total - gorjetaPlataforma) / 1.06 + gorjetaPlataforma : total;

  const boltExibido = ajustarBase(receitas.bolt, gBolt);
  const uberExibido = ajustarBase(receitas.uber, gUber);
  const receitasExibidas = {
    bolt: boltExibido,
    uber: uberExibido,
    outras_receitas: receitas.outras_receitas,
  };

  // Receita ajustada = soma das linhas exibidas (gorjeta já embutida uma vez).
  // Quando importado usa-se o total bruto do recibo.
  const receitaAjustada = isImportado
    ? totalReceitas
    : boltExibido + uberExibido + receitas.outras_receitas;

  // NÃO somar `+ gorjeta` aqui — já está em `receitaAjustada`.
  const totalAReceber = isImportado
    ? liquidoImportado
    : receitaAjustada - totalDespesas + valoresSemanaAnterior;

  const liquido = isImportado ? liquidoImportado : totalAReceber;

  return {
    gorjeta,
    totalReceitas,
    receitasExibidas,
    receitaAjustada,
    totalAReceber,
    liquido,
  };
}
