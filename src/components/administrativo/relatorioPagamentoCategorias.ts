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
  | 'seguros'
  | 'acordos'
  | 'caucao'
  | 'bonificacao'
  | 'ajudaCusto'
  | 'outrasDevolucoes'
  | 'outrosDebitos';

// As colunas RNVAT, Neg. Anterior e Dev. Caução foram retiradas a 11/09/2026:
// nunca houve um único movimento com essas categorias e a direção confirmou
// que não se usam. Se algum dia aparecer um, cai no catch-all do seu lado
// (Outros Débitos / Outras Devoluções) em vez de desaparecer.
const CAT_MAP: Record<string, ColunaFinanceira> = {
  seguros: 'seguros',
  acordo: 'acordos',
  caucao: 'caucao',
  bonus: 'bonificacao',
  ajuda_custo: 'ajudaCusto',
  outras_devolucoes: 'outrasDevolucoes',
};

/** Fora do detalhe por coluna seja qual for o tipo — não por ser categoria
 *  desconhecida, mas porque já está representada noutro número da mesma
 *  linha. Contá-la outra vez seria contar duas vezes.
 *
 *  `resumos` é o líquido da semana, escrito de volta em motorista_financeiro
 *  pelo trigger `sincronizar_movimento_resumo`. É exactamente a coluna
 *  "Valor a Pagar". Enquanto caía no catch-all dos créditos, inchava "Outras
 *  Devoluções" com o pagamento inteiro — na semana 31/08–06/09 eram
 *  85.846,80 € numa coluna cujo resto somava 255,24 €. */
const JA_NOUTRA_COLUNA = ['resumos'];

/** Fora do detalhe só do lado do DÉBITO.
 *
 *  A renda cobrada já vem da coluna "Viatura", calculada a partir de
 *  dias × tarifa do contrato — um débito de `renda_viatura` somado aqui
 *  duplicava o aluguer (Ranjeet Singh apareceu com 450 € em vez dos 225 €
 *  certos).
 *
 *  O CRÉDITO é outra coisa: é o desconto na renda por dias em que o
 *  motorista não teve a viatura ("semana avaria", "valor viatura deixada no
 *  prior", "DIA POR VINDA A LEIRIA"). Não duplica nada — a coluna "Viatura"
 *  mostra a renda cheia e não sabe do desconto. Enquanto esta regra apanhava
 *  os dois tipos por arrasto, o desconto entrava no "Valor a Pagar" sem
 *  aparecer em coluna nenhuma: 496,43 € na semana 31/08–06/09, 2.467,85 € em
 *  43 movimentos desde sempre. Vai para "Outras Devoluções" (11/09/2026). */
const DEBITO_JA_NOUTRA_COLUNA = ['renda_viatura'];

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

/**
 * `undefined` = este movimento fica fora do detalhe por coluna (mas continua
 * a contar para o total, que vem de outro lado). Só acontece para as
 * categorias de `JA_NOUTRA_COLUNA` e para os débitos de
 * `DEBITO_JA_NOUTRA_COLUNA`, que já estão representados noutro número da
 * linha.
 *
 * Uma categoria reconhecida vai sempre para a sua coluna. Uma categoria
 * desconhecida vai para o catch-all do seu lado: crédito para "Outras
 * Devoluções", débito para "Outros Débitos".
 *
 * A coluna "Outros Débitos" existe precisamente porque não havia catch-all
 * do lado do débito. As outras colunas têm significado próprio (caução,
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
  const credito = norm(tipo) === 'credito';
  if (JA_NOUTRA_COLUNA.includes(cat)) return undefined;
  if (!credito && DEBITO_JA_NOUTRA_COLUNA.includes(cat)) return undefined;
  const mapeada = CAT_MAP[cat];
  if (mapeada) return mapeada;
  return credito ? 'outrasDevolucoes' : 'outrosDebitos';
}
