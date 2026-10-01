export interface ResumoFinanceiroInput {
  isImportado: boolean;
  reciboVerde: boolean;
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

  // Os 6% só incidem sobre a base; a gorjeta já está faturada e não é dividida.
  const semReciboVerde = !isImportado && !reciboVerde;

  const ajustarBase = (total: number, gorjetaPlataforma: number) =>
    semReciboVerde ? (total - gorjetaPlataforma) / 1.06 + gorjetaPlataforma : total;

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

  // A gorjeta já integra `receitaAjustada`; somá-la aqui duplicaria o valor.
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
