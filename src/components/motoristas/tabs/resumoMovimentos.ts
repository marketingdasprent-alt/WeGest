/**
 * Totais do financeiro de um motorista, a partir da lista de movimentos.
 *
 * Existem dois pares e a distinção é a razão de ser deste ficheiro:
 *
 * - `creditos` / `debitos` — só o que está `pendente`. É o que ainda há a
 *   cobrar ou a devolver, e é isto que vai para os cartões do topo. Usa a
 *   mesma base do RPC `motorista_saldo_pendente` (que filtra
 *   `status = 'pendente'`), para os três cartões fecharem entre si:
 *   saldo = créditos − débitos.
 *
 * - `acumuladoCreditos` / `acumuladoDebitos` — tudo o que alguma vez foi
 *   lançado, liquidados incluídos. É histórico, não é dívida, e por isso vive
 *   no rodapé do histórico de movimentos, nunca num cartão.
 *
 * O cartão "Total Débitos" somava tudo o que não estivesse cancelado, pagos
 * incluídos. Um motorista sem dívida nenhuma aparecia com 725,00 € a vermelho
 * ao lado de "Saldo Pendente 0,00 € — Tudo regularizado". Quem olha lê dívida,
 * e mais do que uma pessoa leu.
 *
 * Cancelados não entram em nenhum dos quatro.
 */
export interface MovimentoParaResumo {
  tipo: string;
  valor: number | string;
  status: string;
}

export interface ResumoMovimentos {
  /** Créditos por liquidar (status `pendente`). */
  creditos: number;
  /** Débitos por cobrar (status `pendente`). */
  debitos: number;
  /** Tudo o que já foi creditado, liquidados incluídos. Histórico. */
  acumuladoCreditos: number;
  /** Tudo o que já foi debitado, liquidados incluídos. Histórico. */
  acumuladoDebitos: number;
}

export function calcularResumoMovimentos(
  movimentos: readonly MovimentoParaResumo[]
): ResumoMovimentos {
  const resumo: ResumoMovimentos = {
    creditos: 0,
    debitos: 0,
    acumuladoCreditos: 0,
    acumuladoDebitos: 0,
  };

  for (const movimento of movimentos) {
    if (movimento.status === 'cancelado') continue;

    // Number('') e Number(null) dão 0 e NaN respectivamente; um NaN aqui
    // contamina o total inteiro e o cartão passa a mostrar "NaN €".
    const valor = Number(movimento.valor);
    if (!Number.isFinite(valor)) continue;

    const pendente = movimento.status === 'pendente';

    if (movimento.tipo === 'credito') {
      resumo.acumuladoCreditos += valor;
      if (pendente) resumo.creditos += valor;
    } else {
      resumo.acumuladoDebitos += valor;
      if (pendente) resumo.debitos += valor;
    }
  }

  return resumo;
}
