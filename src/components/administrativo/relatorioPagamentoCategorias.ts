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
  | 'outrasDevolucoes'
  | 'outrosDebitos';

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

/** Categorias que NÃO entram no detalhe por coluna — não por serem
 *  desconhecidas, mas porque já estão representadas noutro número da mesma
 *  linha. Contá-las outra vez seria contar duas vezes:
 *
 *  - `resumos`: é o líquido da semana, escrito de volta em
 *    motorista_financeiro pelo trigger `sincronizar_movimento_resumo`. É
 *    exactamente a coluna "Valor a Pagar". Enquanto caía no catch-all dos
 *    créditos, inchava "Outras Devoluções" com o pagamento inteiro — na
 *    semana 31/08–06/09 eram 85.846,80 € numa coluna cujo resto somava
 *    255,24 €.
 *  - `renda_viatura`: o aluguer vem da coluna "Viatura", calculada a partir
 *    de dias × tarifa do contrato. */
const JA_NOUTRA_COLUNA = ['resumos', 'renda_viatura'];

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * `undefined` = este movimento fica fora do detalhe por coluna (mas continua
 * a contar para o total, que vem de outro lado). Só acontece para as
 * categorias de `JA_NOUTRA_COLUNA`, que já estão representadas noutro número
 * da linha.
 *
 * Uma categoria reconhecida vai sempre para a sua coluna. Uma categoria
 * desconhecida vai para o catch-all do seu lado: crédito para "Outras
 * Devoluções", débito para "Outros Débitos".
 *
 * A coluna "Outros Débitos" existe precisamente porque não havia catch-all
 * do lado do débito. As nove colunas têm significado próprio (caução,
 * seguros, etc.) e nenhuma servia de genérica, por isso um débito de
 * categoria nova ficava simplesmente de fora — na semana 31/08–06/09,
 * 941,25 € de `slot_mensal`, 623,52 € de `desconto` e 295,43 € de `outro`
 * contavam no líquido e na coluna "Outros" dos Resumos sem deixar rasto
 * nenhum aqui. Uma coluna genérica honesta é melhor do que um buraco: o
 * detalhe passa a fechar com o "Valor a Pagar".
 */
export function colunaDoMovimento(
  categoria: string | null | undefined,
  tipo: string | null | undefined
): ColunaFinanceira | undefined {
  const cat = norm(categoria);
  if (JA_NOUTRA_COLUNA.includes(cat)) return undefined;
  const mapeada = CAT_MAP[cat];
  if (mapeada) return mapeada;
  return norm(tipo) === 'credito' ? 'outrasDevolucoes' : 'outrosDebitos';
}
