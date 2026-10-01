import type { AutomationEdge as Edge, AutomationNode as Node } from './dominio/tipos';

// O estado efémero do React Flow não integra o payload; o layout preserva apenas
// posições para redesenhar o fluxo sem afectar a lógica do backend.

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
    // O React Flow mantém arestas órfãs momentaneamente após apagar um nó;
    // excluí-las evita rejeitar um fluxo válido por estado transitório da UI.
    ligacoes: edges
      .filter((e) => idsExistentes.has(e.source) && idsExistentes.has(e.target))
      .map((e) => ({ de: e.source, para: e.target })),
    layout: Object.fromEntries(nodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }])),
  };
}
