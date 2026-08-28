import type { AutomationEdge as Edge, AutomationNode as Node } from './dominio/tipos';

/**
 * Transforma o canvas no payload que irá para o backend.
 *
 * O React Flow pendura estado de interface nos nós — `selected`, `dragging`,
 * `measured`, `width`, `handles` — que muda a cada clique. Enviar isso fazia
 * o payload mudar sem que a lógica tivesse mudado, e um diff no servidor não
 * conseguiria distinguir "o utilizador editou" de "o utilizador clicou".
 *
 * A posição não é lógica, mas também não é descartável: sem ela o fluxo não
 * pode ser redesenhado como o utilizador o deixou. Por isso sai de dentro do
 * nó e vai para um bloco `layout` à parte — o backend pode ignorá-lo por
 * completo sem perder nada da lógica.
 */

export interface NoSerializado {
  id: string;
  tipo: string;
  config: Record<string, unknown>;
}

export interface LigacaoSerializada {
  de: string;
  para: string;
}

export interface PayloadFluxo {
  versao: 1;
  nos: NoSerializado[];
  ligacoes: LigacaoSerializada[];
  /** Posições, por id de nó. Puramente visual. */
  layout: Record<string, { x: number; y: number }>;
}

export function serializarFluxo(nodes: Node[], edges: Edge[]): PayloadFluxo {
  const idsExistentes = new Set(nodes.map((n) => n.id));

  return {
    versao: 1,
    nos: nodes.map((n) => ({
      id: n.id,
      tipo: n.type ?? 'desconhecido',
      config: { ...(n.data as Record<string, unknown>) },
    })),
    // Apagar um nó com Delete deixa arestas órfãs por um instante. Deixá-las
    // passar fazia o backend rejeitar o fluxo inteiro por causa de uma ponta
    // solta que o utilizador nem vê.
    ligacoes: edges
      .filter((e) => idsExistentes.has(e.source) && idsExistentes.has(e.target))
      .map((e) => ({ de: e.source, para: e.target })),
    layout: Object.fromEntries(nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }])),
  };
}
