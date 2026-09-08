export interface ResumoSemanalRow {
  motorista_id: string;
  custo_aluguer: number;
  receita_bolt: number;
  receita_uber: number;
  receita_outras: number;
  despesa_caucao: number;
  despesa_seguros: number;
  despesa_outros: number;
}

export interface MotoristaInfo {
  id: string;
  nome: string;
  email: string | null;
}

export interface SettlementData {
  driver_name: string;
  email: string;
  total_faturado: number;
  faturado_bolt: number;
  faturado_uber: number;
  liquido: number;
  aluguer: number;
  outros_custos: number;
  periodo: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * motorista_resumo_semanal pode ter mais que uma linha por motorista na
 * mesma semana (troca de viatura a meio, ver comentário da própria
 * migração) — soma-se por motorista_id antes de construir o acerto.
 *
 * O LÍQUIDO NÃO SE CALCULA AQUI.
 *
 * Vinha daqui um terceiro número: `faturado − aluguer − outros`, sem os 6%
 * do recibo verde, sem combustível, sem portagens e sem reparações — porque
 * motorista_resumo_semanal não tem colunas para nada disso. Era o valor mais
 * afastado dos dois ecrãs, e ia por email para o próprio motorista.
 *
 * O líquido bom é um só: o que o resumo mostra e grava em
 * motorista_liquido_semanal. É esse que aqui se lê, tal e qual. Um motorista
 * sem líquido gravado (ninguém abriu o resumo da semana dele) NÃO leva
 * email — mais vale não enviar nada do que enviar um número diferente
 * daquele que lhe foi mostrado.
 *
 * As linhas de custo (aluguer, outros) continuam a vir do resumo semanal:
 * servem só para detalhar o email, não para chegar ao total.
 */
export function buildSettlements(
  resumoRows: ResumoSemanalRow[],
  motoristas: MotoristaInfo[],
  periodo: string,
  liquidoPorMotorista: Map<string, number>,
): SettlementData[] {
  const motoristaById = new Map(motoristas.map((m) => [m.id, m]));

  const totals = new Map<
    string,
    { aluguer: number; bolt: number; uber: number; outras: number; caucao: number; seguros: number; outros: number }
  >();

  for (const row of resumoRows) {
    const acc = totals.get(row.motorista_id) ?? {
      aluguer: 0,
      bolt: 0,
      uber: 0,
      outras: 0,
      caucao: 0,
      seguros: 0,
      outros: 0,
    };
    acc.aluguer += row.custo_aluguer;
    acc.bolt += row.receita_bolt;
    acc.uber += row.receita_uber;
    acc.outras += row.receita_outras;
    acc.caucao += row.despesa_caucao;
    acc.seguros += row.despesa_seguros;
    acc.outros += row.despesa_outros;
    totals.set(row.motorista_id, acc);
  }

  const settlements: SettlementData[] = [];
  for (const [motoristaId, acc] of totals) {
    const motorista = motoristaById.get(motoristaId);
    if (!motorista?.email) continue;

    // Sem líquido gravado não há acerto para enviar. Ver o comentário da
    // função: um número inventado aqui contradiria o resumo do motorista.
    const liquido = liquidoPorMotorista.get(motoristaId);
    if (liquido === undefined) continue;

    const total_faturado = round2(acc.bolt + acc.uber + acc.outras);
    const outros_custos = round2(acc.caucao + acc.seguros + acc.outros);
    const aluguer = round2(acc.aluguer);

    settlements.push({
      driver_name: motorista.nome,
      email: motorista.email,
      total_faturado,
      faturado_bolt: round2(acc.bolt),
      faturado_uber: round2(acc.uber),
      liquido: round2(liquido),
      aluguer,
      outros_custos,
      periodo,
    });
  }

  return settlements;
}
