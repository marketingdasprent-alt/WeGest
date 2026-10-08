// Total de um documento fiscal: o que o WeGest pediu e o que o provider emitiu.
// TS puro, sem APIs de Deno: usado pela edge function faturacao-emitir e
// testado pelo Vitest (src/lib/faturacaoTotal.test.ts).

export interface LinhaParaTotal {
  quantidade: number;
  preco_unitario: number; // sem IVA
  taxa_iva: number;
  desconto?: number; // %
}

/** Até 5 cêntimos é arredondamento por linha, não um documento errado. */
export const TOLERANCIA_TOTAL = 0.05;

export function totalComIva(itens: LinhaParaTotal[]): number {
  return itens.reduce((s, it) => {
    const base = (Number(it.quantidade) || 0) * (Number(it.preco_unitario) || 0);
    const comDesc = base * (1 - (Number(it.desconto) || 0) / 100);
    return s + comDesc * (1 + (Number(it.taxa_iva) || 0) / 100);
  }, 0);
}

/**
 * Aviso quando o documento emitido não tem o total pedido. Em 10/2026 a conta da
 * Dasp Rent Sul leu o preço sem IVA como IVA incluído e 26 faturas saíram mais baixas
 * sem ninguém notar, porque o WeGest só guardava o total que tinha calculado.
 */
export function avisoTotalDivergente(
  esperado: number,
  emitido: number | null | undefined,
  numero: string
): string | null {
  if (emitido == null || !Number.isFinite(emitido)) return null;
  if (Math.abs(emitido - esperado) <= TOLERANCIA_TOTAL) return null;
  return (
    `O documento ${numero} saiu com o total de ${emitido.toFixed(2)} €, ` +
    `mas o WeGest pediu ${esperado.toFixed(2)} €. Confirme no software de faturação ` +
    'se o artigo ou a conta estão configurados com preços com IVA incluído, ' +
    'e corrija este documento com uma nota de crédito.'
  );
}
