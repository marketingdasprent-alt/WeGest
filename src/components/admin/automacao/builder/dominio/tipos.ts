// O domínio mantém a forma do canvas para limitar a adaptação à fronteira da UI.

export interface PosicaoNo {
  x: number;
  y: number;
}

export interface AutomationNode {
  id: string;
  type?: string;
  position: PosicaoNo;
  data: Record<string, unknown>;
}

export interface AutomationEdge {
  id: string;
  source: string;
  target: string;
  data?: Record<string, unknown>;
}

export interface AutomationGraph {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
}
