/**
 * Totais do financeiro de um motorista, a partir da lista de movimentos.
 *
 * `creditos`/`debitos` são só o `pendente` (mesma base do RPC
 * `motorista_saldo_pendente`, para os cartões fecharem entre si). Os
 * `acumulado*` incluem liquidados — é histórico, não dívida.
 *
 * Antes o cartão "Total Débitos" somava também os pagos: um motorista sem
 * dívida aparecia com 725 € a vermelho. Cancelados não entram em nenhum dos quatro.
 */
export interface MovimentoParaResumo {
  id?: string;
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

/**
 * `jaNoResumo`: ids que o líquido semanal gravado já soma (RPC
 * `movimentos_ja_no_resumo`). Continuam pendentes na lista, mas contá-los
 * aqui era contá-los duas vezes, como fazia o saldo até 2026-10-12.
 */
export function calcularResumoMovimentos(
  movimentos: readonly MovimentoParaResumo[],
  jaNoResumo: ReadonlySet<string> = new Set()
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

    const pendente =
      movimento.status === 'pendente' && !(movimento.id && jaNoResumo.has(movimento.id));

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
