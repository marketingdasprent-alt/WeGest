import type { AutomationEdge as Edge, AutomationNode as Node } from './dominio/tipos';

/**
 * Põe a corrente em linha, pela ordem das LIGAÇÕES.
 *
 * Não pela ordem do array — que fica baralhada assim que se apaga e volta a
 * acrescentar um bloco — nem pela posição onde os blocos calharam cair.
 *
 * O motor executa uma corrente por regra, por isso uma linha horizontal chega:
 * não há ramos para dispor em árvore.
 */

/** Igual ao espaçamento com que uma regra é desenhada de raiz. */
export const PASSO_X = 320;
/** Linha de baixo, para blocos ainda por ligar. */
const PASSO_Y = 200;

export function arrumarFluxo(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return [];

  const existe = new Set(nodes.map((n) => n.id));
  const seguinte = new Map<string, string>();
  const temEntrada = new Set<string>();
  for (const e of edges) {
    if (!existe.has(e.source) || !existe.has(e.target)) continue;
    seguinte.set(e.source, e.target);
    temEntrada.add(e.target);
  }

  // O início é quem não recebe ligação nenhuma — o gatilho. Começar noutro
  // sítio desenhava a corrente ao contrário.
  const inicio = nodes.find((n) => !temEntrada.has(n.id));

  const posicoes = new Map<string, { x: number; y: number }>();
  let coluna = 0;
  let actual = inicio?.id;
  // `existe.size` como tecto: o editor deixa ligar a→b e b→a, e sem guarda
  // isto pendurava o browser.
  while (actual && !posicoes.has(actual) && posicoes.size <= existe.size) {
    posicoes.set(actual, { x: coluna * PASSO_X, y: 0 });
    coluna += 1;
    actual = seguinte.get(actual);
  }

  // O que ficou de fora — blocos largados e ainda por ligar — vai para baixo,
  // em linha, sem se sobrepor à corrente.
  let soltos = 0;
  for (const n of nodes) {
    if (posicoes.has(n.id)) continue;
    posicoes.set(n.id, { x: soltos * PASSO_X, y: PASSO_Y });
    soltos += 1;
  }

  return nodes.map((n) => ({ ...n, position: posicoes.get(n.id) ?? n.position }));
}
