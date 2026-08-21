/**
 * Cor do momento no título da Folha de Danos.
 *
 * A folha é impressa e assinada em cima do carro, muitas vezes à pressa e sob
 * chuva. Quem a recebe tem de perceber num relance se está a olhar para uma
 * entrega ou para um retorno — trocar as duas é assinar o estado errado da
 * viatura. A cor é a leitura rápida; o texto continua lá para quem imprime a
 * preto e branco.
 *
 *   ENTREGA    verde     — a viatura sai para o motorista
 *   RECOLHA    vermelho  — a empresa foi buscá-la (o motorista não a entregou)
 *   DEVOLUÇÃO  azul      — o motorista trouxe-a, fim normal
 *
 * Cores saturadas e a dobrar do tamanho do resto do título, a negrito. A
 * primeira tentativa usou tons escuros discretos, a pensar em fotocópias — na
 * folha real passavam despercebidos, que é o oposto do objectivo. Saturado
 * continua a imprimir sólido; é o cinzento-claro que desaparece.
 */

/** Vermelho vivo. */
export const COR_RECOLHA = '#D50000';
/** Verde vivo. */
export const COR_ENTREGA = '#009640';
/** Azul vivo. */
export const COR_DEVOLUCAO = '#0050C8';

/**
 * Tamanho do momento, em pontos.
 *
 * O resto do título sai a 10pt — é o valor por omissão do compositor, e o
 * template não impõe tamanho nenhum ao `<h1>`. A 20pt o momento fica ao dobro
 * e é a primeira coisa que se lê na folha. O compositor usa o maior tamanho da
 * linha para calcular a altura (`maxFontSize`), por isso nada se sobrepõe.
 */
export const TAMANHO_MOMENTO_PT = 20;
/** Preto — momento desconhecido ou vazio. */
export const COR_NEUTRA = '#000000';

// Os momentos são produzidos pelo nosso próprio código (FecharContratoDialog,
// RecolhaCheckinStep, entregaOperations, generateContratoPdf), por isso o
// conjunto é fechado e pequeno — não vale a pena normalizar acentos. Aceita as
// duas grafias de devolução porque ambas já circulam no código.
const CORES: Record<string, string> = {
  ENTREGA: COR_ENTREGA,
  RECOLHA: COR_RECOLHA,
  DEVOLUÇÃO: COR_DEVOLUCAO,
  DEVOLUCAO: COR_DEVOLUCAO,
};

export function corDoMomentoFolha(momento: string | null | undefined): string {
  if (!momento) return COR_NEUTRA;
  return CORES[momento.trim().toUpperCase()] ?? COR_NEUTRA;
}

/**
 * O momento pronto a substituir no `{{momento_folha}}` do template.
 *
 * Um `<strong>` com cor e tamanho inline: o parser liga o negrito pela tag e lê
 * `color` e `font-size` dos estilos de qualquer elemento; o compositor pinta e
 * dimensiona cada segmento.
 *
 * Fica em código e não no HTML do template DE PROPÓSITO: os templates são
 * editáveis na interface e existe um por organização, portanto isto perder-se-ia
 * na primeira vez que alguém mexesse no título — e teria de ser reposto em cada
 * empresa nova.
 *
 * Nada de fundo colorido: o compositor não sabe desenhar rectângulos
 * (`render-html-block.ts` só escreve texto), pelo que um crachá exigiria
 * reescrevê-lo.
 */
export function momentoFolhaHtml(momento: string | null | undefined): string {
  if (!momento) return '';
  const cor = corDoMomentoFolha(momento);
  return `<strong style="color:${cor};font-size:${TAMANHO_MOMENTO_PT}px">${momento}</strong>`;
}
