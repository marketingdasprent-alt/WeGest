/**
 * Estado de uma cobrança tal como deve ser MOSTRADO ao utilizador.
 *
 * Porque não basta mostrar `contrato_cobrancas.estado` cru: uma fatura
 * totalmente coberta por notas de crédito continua `emitida` na base de dados —
 * e isso está CERTO. Fiscalmente a fatura não desaparece (existe para o SAF-T);
 * é *regularizada* pela nota de crédito, que a abate.
 *
 * Mas no ecrã, mostrar "Emitida" numa fatura já integralmente creditada dá a
 * ideia errada de que ainda há algo por liquidar. Por isso mostra-se
 * **"Creditada"**.
 *
 * Porque NÃO se usa "Anulada": esse é o estado do fluxo "anular faturação",
 * que estorna a cobrança lançando um crédito do valor total na conta-corrente.
 * A nota de crédito já lançou o crédito dela — marcar também a cobrança como
 * anulada creditaria o cliente DUAS VEZES e deixaria o saldo negativo.
 */

export const ESTADO_COBRANCA_CLASS: Record<string, string> = {
  pendente: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  emitida: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  paga: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  anulada: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  creditada: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
};

/** Tolerância de cêntimo, para não falhar por arredondamento. */
const EPS = 0.005;

export interface EstadoCobrancaDisplay {
  /** Texto a mostrar no badge. */
  label: string;
  /** Classes de cor do badge. */
  className: string;
  /** true quando as notas de crédito cobrem a totalidade da fatura. */
  totalmenteCreditada: boolean;
}

/**
 * Calcula o estado a mostrar.
 *
 * @param estado      estado cru da cobrança (`contrato_cobrancas.estado`)
 * @param valorTotal  total da cobrança (com IVA)
 * @param jaCreditado soma das notas de crédito ATIVAS desta cobrança
 *
 * Só cobranças `emitida`/`paga` viram "Creditada" — uma cobrança `pendente`
 * (ainda por emitir) ou já `anulada` mantém o seu estado. Crédito PARCIAL
 * também mantém o estado: a coluna de Nota de Crédito é que indica "Parcial".
 */
export function estadoCobrancaDisplay(
  estado: string,
  valorTotal: number | null | undefined,
  jaCreditado: number | null | undefined
): EstadoCobrancaDisplay {
  const total = Number(valorTotal ?? 0);
  const creditado = Number(jaCreditado ?? 0);
  const totalmenteCreditada =
    (estado === 'emitida' || estado === 'paga') && total > 0 && creditado >= total - EPS;

  if (totalmenteCreditada) {
    return {
      label: 'Creditada',
      className: ESTADO_COBRANCA_CLASS.creditada,
      totalmenteCreditada: true,
    };
  }
  return {
    label: estado,
    className: ESTADO_COBRANCA_CLASS[estado] ?? '',
    totalmenteCreditada: false,
  };
}
