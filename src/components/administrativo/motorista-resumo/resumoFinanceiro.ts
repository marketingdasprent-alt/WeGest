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
  /** Receitas por plataforma tal como as plataformas as pagaram — BRUTO, o
   *  mesmo número que a lista de Contas/Resumo mostra. Mostrar aqui o valor
   *  já deduzido fazia o mesmo motorista aparecer com "Bolt 100,76" na lista
   *  e "Bolt 95,06" no resumo, sem nada a explicar a diferença. */
  receitasExibidas: { bolt: number; uber: number; outras_receitas: number };
  /** Quanto os 6% do recibo verde cortam ao bruto (0 quando passa recibo
   *  verde ou é recibo importado). Existe para o resumo poder mostrar o
   *  bruto e continuar a fechar: bruto − dedução = receitaAjustada. */
  deducaoReciboVerde: number;
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

  // Exibe-se o BRUTO por plataforma (igual à lista de Contas/Resumo) e o
  // corte dos 6% aparece numa linha própria — em vez de estar diluído nos
  // valores de cada plataforma, onde ninguém o via.
  const receitasExibidas = {
    bolt: receitas.bolt,
    uber: receitas.uber,
    outras_receitas: receitas.outras_receitas,
  };

  // Receita ajustada = base já com os 6% aplicados (gorjeta embutida uma vez).
  // Quando importado usa-se o total bruto do recibo.
  const receitaAjustada = isImportado
    ? totalReceitas
    : boltExibido + uberExibido + receitas.outras_receitas;

  const deducaoReciboVerde = isImportado ? 0 : totalReceitas - receitaAjustada;

  // NÃO somar `+ gorjeta` aqui — já está em `receitaAjustada`.
  const totalAReceber = isImportado
    ? liquidoImportado
    : receitaAjustada - totalDespesas + valoresSemanaAnterior;

  const liquido = isImportado ? liquidoImportado : totalAReceber;

  return {
    gorjeta,
    totalReceitas,
    receitasExibidas,
    deducaoReciboVerde,
    receitaAjustada,
    totalAReceber,
    liquido,
  };
}
