// Para que coluna do Relatório de Pagamento vai cada movimento financeiro.
//
// O relatório tinha uma lista fixa de 9 categorias reconhecidas. Categorias
// fora dessa lista — sobretudo `outro`, usada para acertos avulsos como
// "Sem acesso a 1 plataforma" ou "valor em falta uber" — desapareciam do
// relatório em silêncio: nem apareciam numa coluna, nem havia sinal de que
// tinham ficado de fora. Caso real: Pedro Martins e Paulo Silva (PREMIUM
// RIDE) tinham créditos pendentes de 100 € e 75 € que nunca chegavam a
// aparecer aqui.
//
// O total a pagar (liquido) já vinha certo — essa soma faz-se noutro sítio
// (ContasResumoTab) e nunca ignorou `outro`. Só o DETALHE por coluna é que
// escondia de onde vinha o dinheiro.

export type ColunaFinanceira =
  | 'rnvat'
  | 'seguros'
  | 'acordos'
  | 'caucao'
  | 'negativoAnterior'
  | 'devCaucao'
  | 'bonificacao'
  | 'ajudaCusto'
  | 'outrasDevolucoes';

const CAT_MAP: Record<string, ColunaFinanceira> = {
  rnvat: 'rnvat',
  seguros: 'seguros',
  acordo: 'acordos',
  caucao: 'caucao',
  negativo_anterior: 'negativoAnterior',
  dev_caucao: 'devCaucao',
  bonus: 'bonificacao',
  ajuda_custo: 'ajudaCusto',
  outras_devolucoes: 'outrasDevolucoes',
};

/**
 * `undefined` = este movimento fica fora do detalhe por coluna (mas continua
 * a contar para o total, que vem de outro lado).
 *
 * Uma categoria reconhecida vai sempre para a sua coluna. Uma categoria
 * desconhecida (tipicamente `outro`) só tem coluna quando é um CRÉDITO — cai
 * em "Outras Devoluções", o mesmo catch-all que a categoria homónima já usa.
 * Um DÉBITO desconhecido não tem coluna genérica correspondente entre as 9
 * existentes (cada uma tem um significado próprio — caução, seguros, etc.) e
 * fica de fora do detalhe, como sempre esteve; não se inventa uma coluna
 * errada só para não ficar vazio.
 */
export function colunaDoMovimento(
  categoria: string | null | undefined,
  tipo: string | null | undefined
): ColunaFinanceira | undefined {
  const mapeada = categoria ? CAT_MAP[categoria] : undefined;
  if (mapeada) return mapeada;
  return tipo === 'credito' ? 'outrasDevolucoes' : undefined;
}
