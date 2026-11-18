// Uma fatura integralmente regularizada por nota de crédito é "Creditada" na UI,
// não "Anulada": anulá-la lançaria um segundo crédito na conta-corrente.

export const ESTADO_COBRANCA_CLASS: Record<string, string> = {
  pendente: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  emitida: 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  paga: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  anulada: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  creditada: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
};

const EPS = 0.005;

export interface EstadoCobrancaDisplay {
  label: string;
  className: string;
  totalmenteCreditada: boolean;
  /** Cobrança registada, mas sem documento fiscal emitido: não é uma fatura. */
  semDocumentoFiscal: boolean;
}

// Só estados emitidos/pagos viram "Creditada"; crédito parcial mantém o estado.
//
// "emitida" é o estado INTERNO da cobrança (nasce assim, antes de falar com o fornecedor de
// faturação). Sem documento fiscal ainda não há fatura: a lista não pode dizer "emitida".
export function estadoCobrancaDisplay(
  estado: string,
  valorTotal: number | null | undefined,
  jaCreditado: number | null | undefined,
  semDocumentoFiscal = false
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
      semDocumentoFiscal: false,
    };
  }
  if (semDocumentoFiscal && estado === 'emitida') {
    return {
      label: 'Sem fatura fiscal',
      className: ESTADO_COBRANCA_CLASS.pendente,
      totalmenteCreditada: false,
      semDocumentoFiscal: true,
    };
  }
  return {
    label: estado,
    className: ESTADO_COBRANCA_CLASS[estado] ?? '',
    totalmenteCreditada: false,
    semDocumentoFiscal: false,
  };
}
