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
  /** Saldo pendente do motorista — o mesmo número do cartão "Saldo Pendente"
   *  do perfil (RPC motorista_saldo_pendente). Não é calculado aqui: vem
   *  pronto de quem chama, para não haver duas versões da mesma conta. */
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
 * Junta as três parcelas de uma dívida.
 *
 * `saldoPendente` vem do RPC motorista_saldo_pendente — é o mesmo valor que
 * o perfil do motorista mostra, e é passado para dentro em vez de
 * recalculado, para os dois ecrãs nunca discordarem.
 *
 * `movimentosDanos` já vem filtrado pela query ao intervalo escolhido;
 * `movimentosCaucao` NÃO tem filtro de data — a caução de Janeiro continua
 * a valer em Setembro.
 */
export function calcularValoresDivida(
  saldoPendente: number,
  movimentosDanos: readonly MovimentoParaDivida[],
  movimentosCaucao: readonly MovimentoParaDivida[]
): ValoresDivida {
  let valorDanos = 0;
  for (const m of movimentosDanos) {
    if (m.status !== 'pendente' || m.categoria !== 'reparacao') continue;
    const valor = valorNumerico(m);
    valorDanos += m.tipo === 'debito' ? valor : -valor;
  }
  // Um estorno de reparação a mais não é dinheiro a favor do motorista
  // nesta coluna — é ruído de lançamento, não uma dívida negativa.
  valorDanos = Math.max(valorDanos, 0);

  // Tudo o que tiver categoria caucao, e mais nada — crédito soma, débito
  // subtrai, o mesmo critério do resto da app (resumoMovimentos.ts:
  // saldo = créditos − débitos).
  let valorCaucao = 0;
  for (const m of movimentosCaucao) {
    if (m.status !== 'pendente' || m.categoria !== 'caucao') continue;
    const valor = valorNumerico(m);
    valorCaucao += m.tipo === 'credito' ? valor : -valor;
  }

  // Saldo negativo e danos são o que o motorista deve; a caução já está em
  // poder da empresa e abate. Um saldo positivo não perdoa danos por esta
  // via (daí o min(...,0)) — seria compensar duas contas diferentes.
  const valorTotal = Math.abs(Math.min(saldoPendente, 0)) + valorDanos - valorCaucao;

  return {
    valorPeriodo: round2(saldoPendente),
    valorDanos: round2(valorDanos),
    valorCaucao: round2(valorCaucao),
    valorTotal: round2(valorTotal),
  };
}
