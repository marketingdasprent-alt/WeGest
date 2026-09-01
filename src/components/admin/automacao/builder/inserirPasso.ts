import type { AutomationEdge as Edge, AutomationNode as Node } from './dominio/tipos';
import { criarNoDoTemplate, type TemplateDeNo } from './catalogo';

/**
 * As formas de acrescentar um passo ao fluxo.
 *
 * `inserirEntre` fica reservada ao "+" no meio de uma ligação existente —
 * aí faz sentido religar as duas pontas através do passo novo. Para tudo o
 * resto (arrastar da paleta, ou clicar sem uma aresta-alvo), o passo entra
 * solto: com um gatilho a poder disparar várias acções em paralelo, não há
 * um "último bloco" único a que ligar automaticamente.
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

/**
 * Larga um bloco no canvas sem ligação nenhuma.
 *
 * Com um gatilho a poder disparar várias acções em paralelo, "ligar ao
 * último bloco" deixou de fazer sentido — não há como dizer se o novo nó
 * é mais um ramo do gatilho ou uma continuação de outro. Quem liga é o
 * utilizador, à mão.
 */
export function inserirSolto(
  nodes: Node[],
  posicao: { x: number; y: number },
  template: TemplateDeNo,
  sequencia: number
): { nodes: Node[] } {
  const novo = criarNoDoTemplate(template, posicao, sequencia);
  return { nodes: [...nodes, novo] };
}
