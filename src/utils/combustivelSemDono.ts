export type FonteCombustivel = 'repsol' | 'edp' | 'bp';

/** Abastecimento gravado sem motorista nem cliente. */
export interface TransacaoSemDono {
  fonte: FonteCombustivel;
  valor: number;
  cardNumber: string | null;
  transactionId: string;
  /** Número do cartão no ficheiro (BP: "Nº cartão"). */
  numeroNoFicheiro?: string | null;
}

export interface GrupoSemDono {
  fonte: FonteCombustivel;
  cartao: string;
  transacoes: number;
  valor: number;
}

export const ROTULO_FONTE: Record<FonteCombustivel, string> = {
  repsol: 'Repsol',
  edp: 'EDP',
  bp: 'BP',
};

/**
 * Número do cartão de um abastecimento: o gravado, ou o do ficheiro, ou o que
 * os importadores põem no transaction_id ("edp-<cartão>-<data>").
 */
export function numeroCartaoDaTransacao(t: TransacaoSemDono): string | null {
  const doFicheiro = (t.numeroNoFicheiro ?? '').trim().split(/[.,]/)[0].replace(/\D/g, '');
  const doId = t.transactionId.match(/^[a-z]+-(\d+)-/)?.[1] ?? '';
  return t.cardNumber || doFicheiro || doId || null;
}

/** Agrupa por fonte e cartão, os de maior valor primeiro. */
export function agruparSemDono(transacoes: readonly TransacaoSemDono[]): GrupoSemDono[] {
  const grupos = new Map<string, GrupoSemDono>();
  for (const t of transacoes) {
    if (!(t.valor > 0)) continue;
    const cartao = numeroCartaoDaTransacao(t) ?? 'sem número';
    const chave = `${t.fonte}|${cartao}`;
    const g = grupos.get(chave) ?? { fonte: t.fonte, cartao, transacoes: 0, valor: 0 };
    g.transacoes += 1;
    g.valor += t.valor;
    grupos.set(chave, g);
  }
  return [...grupos.values()].sort((a, b) => b.valor - a.valor);
}

/** Texto para o fim de uma importação; nulo quando tudo ficou com dono. */
export function avisoImportacaoSemTitular(semTitular: unknown): string | null {
  const n = typeof semTitular === 'number' ? semTitular : 0;
  if (n <= 0) return null;
  return `${n} ${n === 1 ? 'abastecimento ficou' : 'abastecimentos ficaram'} sem motorista nem cliente. Registe o titular do cartão em Administrativo → Cartões Frota.`;
}
