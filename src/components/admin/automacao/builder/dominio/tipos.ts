/**
 * O grafo de uma automação, na linguagem da aplicação.
 *
 * Estes tipos existem para o domínio NÃO depender da biblioteca de canvas. Até
 * aqui, sete módulos de lógica pura importavam `Node` e `Edge` do
 * da biblioteca de canvas sem precisarem de nada dela — só da forma. Isso
 * fazia com que trocar de biblioteca tocasse em 25 ficheiros em vez de 3.
 *
 * A forma é deliberadamente a mesma que o React Flow usa. Renomear os campos
 * (`type` → `tipo`, `source` → `de`) provaria melhor a independência, mas
 * obrigava a reescrever sete módulos e os seus testes num sistema que envia
 * emails a clientes reais — churn com risco e sem benefício. O que interessa é
 * que o domínio deixou de importar a biblioteca; se a próxima tiver outra
 * forma, é o adaptador que muda, não estes módulos.
 */

export interface PosicaoNo {
  x: number;
  y: number;
}

export interface AutomationNode {
  id: string;
  /** 'trigger' | 'condicao' | 'accao' | 'erro' — aberto, o catálogo é que manda. */
  type?: string;
  position: PosicaoNo;
  data: Record<string, unknown>;
}

export interface AutomationEdge {
  id: string;
  source: string;
  target: string;
  /** Estilo/marcadores são decisão da camada de canvas, não do domínio. */
  data?: Record<string, unknown>;
}

export interface AutomationGraph {
  nodes: AutomationNode[];
  edges: AutomationEdge[];
}
