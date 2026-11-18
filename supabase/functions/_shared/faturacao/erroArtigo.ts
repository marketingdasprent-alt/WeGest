// Mensagens claras para o erro de artigo (IdProduct) da KeyInvoice.
//
// Cada linha de uma fatura leva o código de um artigo da CONTA KeyInvoice da
// empresa emissora. Se o artigo não existe nessa conta, a KeyInvoice recusa a
// linha com "Linha do documento inválida[0]: IdProduct inválido", que não diz
// qual artigo, nem em que conta, nem o que fazer. Foi o que travou as faturas da
// Dasprent Rent A Car em 18/11/2026 (o artigo WEGEST só existia na conta da
// Dasprent Sul). Quem emite lê isto num aviso: tem de perceber sem pedir ajuda.

/** Código do artigo pedido na linha, quando a recusa fala de IdProduct. */
export function recusaDeArtigo(motivo: string | null | undefined): boolean {
  return /id\s*product/i.test(motivo ?? '');
}

/** Frase para o aviso de falha quando a KeyInvoice recusa o artigo de uma linha. */
export function mensagemArtigoRecusado(
  motivo: string,
  artigos: readonly string[],
  nomeDaConta?: string | null
): string {
  const lista = [...new Set(artigos.filter(Boolean))];
  const qual =
    lista.length === 1
      ? `O artigo "${lista[0]}"`
      : `Os artigos ${lista.map((a) => `"${a}"`).join(', ')}`;
  const onde = nomeDaConta ? `na conta KeyInvoice "${nomeDaConta}"` : 'nesta conta KeyInvoice';
  return (
    `${qual} não existe ou não é válido ${onde} (a KeyInvoice respondeu: ${motivo}). ` +
    'Crie-o em Artigos, na conta da empresa que emite este documento, com o código exato, ' +
    'e volte a emitir. Nada foi emitido.'
  );
}

/** Frase para quando nem sequer há código de artigo para enviar. */
export function mensagemSemArtigo(nomeDaConta?: string | null): string {
  const onde = nomeDaConta ? `da conta KeyInvoice "${nomeDaConta}"` : 'desta conta KeyInvoice';
  return (
    `Falta o artigo padrão ${onde}: sem código de artigo a KeyInvoice recusa a linha. ` +
    'Defina o artigo padrão na integração de faturação (ou o segredo KI_DEFAULT_PRODUCT) e volte a emitir. ' +
    'Nada foi emitido.'
  );
}
