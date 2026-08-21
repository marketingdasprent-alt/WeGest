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
 * Tons escuros de propósito: têm de sobreviver a fotocópia e a impressão a
 * jacto de tinta. Nada de cores claras ou saturadas.
 */

/** #C0392B */
export const COR_RECOLHA = '#C0392B';
/** #1E8449 */
export const COR_ENTREGA = '#1E8449';
/** #1F618D */
export const COR_DEVOLUCAO = '#1F618D';
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
 * Devolve um `<span>` com a cor inline — o parser do template lê `color` dos
 * estilos e o compositor pinta o segmento. Fica em código e não no HTML do
 * template de propósito: os templates são editáveis na interface, e a cor
 * perder-se-ia na primeira vez que alguém mexesse no título.
 */
export function momentoFolhaHtml(momento: string | null | undefined): string {
  if (!momento) return '';
  return `<span style="color:${corDoMomentoFolha(momento)}">${momento}</span>`;
}
