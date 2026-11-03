// Teto das notas de crédito: nunca se credita mais do que o documento fiscal vale.
// TS puro, sem APIs de Deno: usado pela edge function faturacao-emitir e
// testado pelo Vitest (src/lib/faturacaoCorrecao.test.ts).
// Em 10/2026 a Dasp Rent Sul emitiu 15 NC acima da FT que corrigiam (NC de 1371,45 numa
// FT de 1115,00): o diálogo limitava pelo total do WeGest, não pelo da KeyInvoice.
import { round2, TOLERANCIA_TOTAL } from './totais.ts';

/** Total válido ou erro: um total em falta contado como zero subestimava o já creditado. */
function numeroOuErro(n: unknown, oQue: string): number {
  if (n == null || n === '' || !Number.isFinite(Number(n))) {
    throw new Error(`${oQue} sem valor válido: não é possível calcular o saldo creditável.`);
  }
  return Number(n);
}

/** O que ainda se pode creditar: total do documento no provider menos as NC já emitidas. */
export function saldoCreditavel({
  totalDocumento,
  ncsEmitidas,
}: {
  totalDocumento: number;
  ncsEmitidas: number[];
}): number {
  const jaCreditado = ncsEmitidas.reduce((s, n) => s + numeroOuErro(n, 'Nota de crédito'), 0);
  return Math.max(0, round2(numeroOuErro(totalDocumento, 'Documento') - jaCreditado));
}

const eur = (n: number) => `${round2(n).toFixed(2).replace('.', ',')} €`;

/** Mensagem de recusa se a NC pedida passa do saldo (com a tolerância de arredondamento), senão null. */
export function recusaNotaCredito({
  pedido,
  saldo,
}: {
  pedido: number;
  saldo: number;
}): string | null {
  if (pedido <= saldo + TOLERANCIA_TOTAL) return null;
  return (
    `A nota de crédito de ${eur(pedido)} é superior ao que ainda se pode creditar nesta fatura ` +
    `(máximo ${eur(saldo)}). Nada foi emitido.`
  );
}

export interface NcParaSoma {
  documento_referencia_id: string | null;
  cobranca_id: string | null;
  total: number | null;
}

/**
 * Totais das NC emitidas contra um documento: as ligadas a ele por id e as antigas, sem
 * ligação, da mesma cobrança (anteriores à coluna documento_referencia_id).
 */
export function ncsContraOriginal(
  original: { id: string; cobranca_id: string | null },
  ncs: NcParaSoma[]
): number[] {
  return ncs
    .filter(
      (nc) =>
        nc.documento_referencia_id === original.id ||
        (nc.documento_referencia_id == null &&
          original.cobranca_id != null &&
          nc.cobranca_id === original.cobranca_id)
    )
    .map((nc) => numeroOuErro(nc.total, 'Nota de crédito emitida'));
}
