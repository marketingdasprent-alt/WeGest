/**
 * Um movimento de motorista_financeiro, reduzido aos campos que este
 * cálculo precisa. `valor` aceita string porque é o que o Supabase devolve
 * para `numeric` sem um mapeamento explícito. `data_movimento` só é
 * usado para aplicar o chão do período à reparação — o resto do cálculo
 * já vem pré-filtrado pela query (ver useCalcularDivida).
 */
export interface MovimentoParaDivida {
  tipo: string; // 'credito' | 'debito'
  categoria: string | null;
  valor: number | string;
  status: string;
  data_movimento: string; // yyyy-MM-dd
}

export interface ValoresDivida {
  valorPeriodo: number;
  valorDanos: number;
  valorCaucao: number;
  valorTotal: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function valorNumerico(m: MovimentoParaDivida): number {
  const n = Number(m.valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Os três valores da dívida saem exclusivamente de motorista_financeiro —
 * ver Global Constraints do plano. As categorias são disjuntas: um movimento
 * de reparação nunca entra no período, um de caução nunca entra no período
 * nem é lido daqui (vem só de `movimentosCaucao`, que não tem filtro de
 * data — a caução de Janeiro continua a valer em Setembro).
 *
 * `movimentosPeriodo` já vem filtrado pela query até `periodoFim` (sem chão
 * de início) — valor_periodo é saldo corrido, o mesmo critério de
 * motorista_saldo_pendente (Σcrédito − Σdébito pendente até uma data), não
 * "só o que aconteceu dentro desta janela". A reparação (danos) é a
 * excepção: continua presa ao intervalo completo, por isso o chão de início
 * é aplicado aqui, só a ela.
 */
export function calcularValoresDivida(
  movimentosPeriodo: readonly MovimentoParaDivida[],
  movimentosCaucao: readonly MovimentoParaDivida[],
  periodoInicio: string
): ValoresDivida {
  let valorPeriodo = 0;
  let valorDanos = 0;

  for (const m of movimentosPeriodo) {
    if (m.status !== 'pendente') continue;
    const valor = valorNumerico(m);
    if (m.categoria === 'reparacao') {
      if (m.data_movimento < periodoInicio) continue;
      valorDanos += m.tipo === 'debito' ? valor : -valor;
    } else if (m.categoria !== 'caucao') {
      valorPeriodo += m.tipo === 'credito' ? valor : -valor;
    }
  }
  // Um estorno de reparação a mais não é dinheiro a favor do motorista
  // nesta coluna — é ruído de lançamento, não uma dívida negativa.
  valorDanos = Math.max(valorDanos, 0);

  // Tudo o que tiver categoria caucao, e mais nada — crédito soma, débito
  // subtrai, o mesmo critério usado no resto da função e no resto da app
  // (resumoMovimentos.ts: saldo = créditos − débitos).
  let valorCaucao = 0;
  for (const m of movimentosCaucao) {
    if (m.status !== 'pendente' || m.categoria !== 'caucao') continue;
    const valor = valorNumerico(m);
    valorCaucao += m.tipo === 'credito' ? valor : -valor;
  }

  // O período negativo e os danos são o que o motorista deve; a caução já
  // está em poder da empresa e abate. Um período positivo não perdoa danos
  // por esta via (daí o min(...,0)) — seria compensar duas contas diferentes.
  const valorTotal = Math.abs(Math.min(valorPeriodo, 0)) + valorDanos - valorCaucao;

  return {
    valorPeriodo: round2(valorPeriodo),
    valorDanos: round2(valorDanos),
    valorCaucao: round2(valorCaucao),
    valorTotal: round2(valorTotal),
  };
}
