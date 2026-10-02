/**
 * Ids de todas as versões do contrato (o código é o mesmo, o id muda a cada
 * renovação), com a versão aberta primeiro. Os danos e fotos da entrega ficam
 * ligados à versão em que foram registados: quem só procura pela versão aberta
 * deixa de os ver depois da primeira renovação.
 */
export function idsDasVersoes(contratoId: string, versoes: readonly { id: string }[]): string[] {
  const ids = new Set<string>([contratoId]);
  for (const v of versoes) ids.add(v.id);
  return [...ids];
}
