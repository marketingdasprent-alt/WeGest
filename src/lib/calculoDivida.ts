/**
 * Um movimento de motorista_financeiro, reduzido aos campos que este
 * cálculo precisa. `valor` aceita string porque é o que o Supabase devolve
 * para `numeric` sem um mapeamento explícito.
 */
export interface MovimentoParaDivida {
  tipo: string; // 'credito' | 'debito'
  categoria: string | null;
  valor: number | string;
  status: string;
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
 */
export function calcularValoresDivida(
  movimentosPeriodo: readonly MovimentoParaDivida[],
  movimentosCaucao: readonly MovimentoParaDivida[]
): ValoresDivida {
  let valorPeriodo = 0;
  let valorDanos = 0;

  for (const m of movimentosPeriodo) {
    if (m.status !== 'pendente') continue;
    const valor = valorNumerico(m);
    if (m.categoria === 'reparacao') {
      valorDanos += m.tipo === 'debito' ? valor : -valor;
    } else if (m.categoria !== 'caucao') {
      valorPeriodo += m.tipo === 'credito' ? valor : -valor;
    }
  }
  // Um estorno de reparação a mais não é dinheiro a favor do motorista
  // nesta coluna — é ruído de lançamento, não uma dívida negativa.
  valorDanos = Math.max(valorDanos, 0);

  // Só o crédito conta — é o que foi atribuído ao motorista como caução.
  // Um débito 'caucao' não é devolução (isso teria categoria dev_caucao);
  // na prática representa uma parcela ainda por pagar da própria caução
  // (ex.: "restante da caução 1/2") — não é dinheiro que já saiu da caução
  // detida, por isso não abate ao valor atribuído.
  let valorCaucao = 0;
  for (const m of movimentosCaucao) {
    if (m.status !== 'pendente' || m.categoria !== 'caucao' || m.tipo !== 'credito') continue;
    valorCaucao += valorNumerico(m);
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
