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

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export function totalComIva(itens: LinhaParaTotal[]): number {
  return itens.reduce((s, it) => {
    const base = (Number(it.quantidade) || 0) * (Number(it.preco_unitario) || 0);
    const comDesc = base * (1 - (Number(it.desconto) || 0) / 100);
    return s + comDesc * (1 + (Number(it.taxa_iva) || 0) / 100);
  }, 0);
}

/**
 * Total que o fornecedor emite, com a regra por linha dos providers: com preços com IVA
 * o preço unitário vai arredondado a cêntimos e multiplicado pela quantidade; sem eles
 * a base e o IVA arredondam-se por linha.
 */
export function totalEsperado(itens: LinhaParaTotal[], precosComIva: boolean): number {
  const total = itens.reduce((s, it) => {
    const taxa = Number(it.taxa_iva) || 0;
    const fator = 1 - (Number(it.desconto) || 0) / 100;
    // Quantidade 0/ausente vai como 1 ao fornecedor (adapters).
    const qtd = Number(it.quantidade) || 1;
    if (precosComIva) {
      const unit = precoParaProvider(Number(it.preco_unitario), taxa, true);
      return s + round2(qtd * unit * fator);
    }
    const base = round2(qtd * (Number(it.preco_unitario) || 0) * fator);
    return s + base + round2((base * taxa) / 100);
  }, 0);
  return round2(total);
}

/** Tolerância proporcional: o erro de arredondamento cresce com a quantidade (0,005 € por unidade) e as linhas. */
export function toleranciaTotal(itens: LinhaParaTotal[]): number {
  const unidades = itens.reduce((s, it) => s + Math.abs(Number(it.quantidade) || 1), 0);
  return Math.max(TOLERANCIA_TOTAL, 0.005 * unidades + 0.01 * itens.length);
}

/**
 * Preço por unidade a mandar ao provider. O WeGest trabalha sem IVA; uma conta
 * configurada com preços com IVA incluído (Dasp Rent Sul, 10/2026) tira o IVA de
 * dentro do valor recebido, por isso para ela manda-se o preço já com IVA.
 */
export function precoParaProvider(
  precoSemIva: number,
  taxaIva: number,
  precosComIva: boolean
): number {
  const preco = Number(precoSemIva) || 0;
  if (!precosComIva) return preco;
  return Math.round(preco * (1 + (Number(taxaIva) || 0) / 100) * 100) / 100;
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
