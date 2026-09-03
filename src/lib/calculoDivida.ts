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
 * Junta as três parcelas de uma dívida. Todas são TOTAIS — nenhuma é
 * filtrada por intervalo de datas (o intervalo do popup é, por agora, só
 * um marcador para uso futuro).
 *
 * `saldoPendente` vem do RPC motorista_saldo_pendente — é o mesmo valor que
 * o perfil do motorista mostra, e é passado para dentro em vez de
 * recalculado, para os dois ecrãs nunca discordarem.
 *
 * DANOS E CAUÇÃO NÃO SE SOMAM AO TOTAL, de propósito. O saldo do RPC soma
 * TODOS os movimentos pendentes, seja qual for a categoria — ou seja, a
 * reparação e a caução já estão lá dentro. Somá-las outra vez contava o
 * mesmo dinheiro duas vezes: o André Bojaca Lopes (saldo −70,00, danos
 * 70,00) aparecia a dever 140,00 quando deve 70,00, e a dívida dele É essa
 * reparação. As duas colunas ficam a explicar de que é feito o saldo, não a
 * acrescentar-lhe nada.
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

  // Só o saldo negativo. Danos e caução já estão dentro dele (ver o cabeçalho
  // desta função) — somá-los aqui era contar o mesmo dinheiro duas vezes. Um
  // saldo positivo não é dívida nenhuma: dá zero, daí o min(...,0).
  const valorTotal = Math.abs(Math.min(saldoPendente, 0));

  return {
    valorPeriodo: round2(saldoPendente),
    valorDanos: round2(valorDanos),
    valorCaucao: round2(valorCaucao),
    valorTotal: round2(valorTotal),
  };
}
