import type { AutomationEdge as Edge, AutomationNode as Node } from './dominio/tipos';

/**
 * Acrescentar passos sem arrastar nada.
 *
 * O `+` no meio de uma ligação e o `+` na ponta da corrente são as duas únicas
 * formas de crescer o fluxo — arrastar da paleta obrigava a acertar a posição
 * à mão e deixava blocos soltos por ligar.
 */

/** Igual ao espaçamento com que o fluxo é desenhado a partir de uma regra. */
const PASSO_X = 320;

function ligar(origem: string, destino: string): Edge {
  return { id: `${origem}--${destino}`, source: origem, target: destino };
}

export function inserirEntre(
  nodes: Node[],
  edges: Edge[],
  arestaId: string,
  novo: Node
): { nodes: Node[]; edges: Edge[] } {
  const aresta = edges.find((e) => e.id === arestaId);
  if (!aresta) return { nodes, edges };

  const origem = nodes.find((n) => n.id === aresta.source);
  const x = (origem?.position.x ?? 0) + PASSO_X;

  return {
    nodes: [
      // Tudo o que estava à direita da origem anda um passo, senão o bloco
      // novo cairia por cima do seguinte.
      ...nodes.map((n) =>
        n.position.x >= x ? { ...n, position: { ...n.position, x: n.position.x + PASSO_X } } : n
      ),
      { ...novo, position: { x, y: origem?.position.y ?? 0 } },
    ],
    edges: [
      // A ligação original TEM de sair: mantê-la deixava dois caminhos, e o
      // passo novo passava a ser ignorável.
      ...edges.filter((e) => e.id !== arestaId),
      ligar(aresta.source, novo.id),
      ligar(novo.id, aresta.target),
    ],
  };
}

export function inserirNaPonta(
  nodes: Node[],
  edges: Edge[],
  novo: Node
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes: [novo], edges };

  // A ponta é o nó mais à direita — é assim que a corrente é desenhada.
  const ultimo = nodes.reduce((a, b) => (b.position.x > a.position.x ? b : a));

  return {
    nodes: [
      ...nodes,
      { ...novo, position: { x: ultimo.position.x + PASSO_X, y: ultimo.position.y } },
    ],
    edges: [...edges, ligar(ultimo.id, novo.id)],
  };
}
