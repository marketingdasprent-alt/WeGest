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
 * combustivel/reparacoes ficam de fora deliberadamente: não são agregados
 * em motorista_resumo_semanal (só em cartões-frota e viatura_reparacoes,
 * por viatura, não por motorista/semana) — enviar "€0" fingiria um dado
 * que não temos.
 */
export function buildSettlements(
  resumoRows: ResumoSemanalRow[],
  motoristas: MotoristaInfo[],
  periodo: string,
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

    const total_faturado = round2(acc.bolt + acc.uber + acc.outras);
    const outros_custos = round2(acc.caucao + acc.seguros + acc.outros);
    const aluguer = round2(acc.aluguer);

    settlements.push({
      driver_name: motorista.nome,
      email: motorista.email,
      total_faturado,
      faturado_bolt: round2(acc.bolt),
      faturado_uber: round2(acc.uber),
      liquido: round2(total_faturado - aluguer - outros_custos),
      aluguer,
      outros_custos,
      periodo,
    });
  }

  return settlements;
}
