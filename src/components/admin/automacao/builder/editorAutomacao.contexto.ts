import { createContext, useContext } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AutomationEdge as Edge, AutomationNode as Node } from './dominio/tipos';

/**
 * O contrato do editor, separado do componente que o fornece.
 *
 * Um ficheiro que exporta um componente E um hook parte o fast refresh do
 * Vite — o ESLint avisa disso. Os tipos e o hook vivem aqui; o Provider
 * fica em EditorAutomacaoProvider.tsx.
 */

export type VistaDoEditor = 'tabela' | 'construtor';

/**
 * Estado do editor, partilhado entre a barra de acções e o canvas.
 *
 * Vive acima das tabs porque a barra tem de ficar na MESMA linha que elas — era
 * a única forma de deixar de ter três cabeçalhos empilhados. O canvas está
 * dentro da tab; sem este contexto, o botão Guardar não alcançava o grafo.
 */

export interface EditorAutomacao {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (nos: Node[]) => void;
  onEdgesChange: (ligacoes: Edge[]) => void;
  setNodes: Dispatch<SetStateAction<Node[]>>;
  setEdges: Dispatch<SetStateAction<Edge[]>>;
  regraId: string | null;
  abrirRegra: (id: string) => void;
  /** Limpa o canvas para desenhar uma automação de raiz. */
  novaAutomacao: () => void;
  /** Volta ao estado anterior do grafo. Só a lógica, não as posições. */
  desfazer: () => void;
  refazer: () => void;
  podeDesfazer: boolean;
  podeRefazer: boolean;
  /** Run aberto no drill-down de execução, se algum. */
  runADepurar: string | null;
  depurar: (runId: string | null) => void;
  /** Lista de automações ou canvas. Vive aqui porque o alternador está na barra. */
  vista: VistaDoEditor;
  setVista: (v: VistaDoEditor) => void;
  moduloFiltro: string;
  setModuloFiltro: (m: string) => void;
  /** Há alterações lógicas que ainda não foram gravadas. */
  sujo: boolean;
  /** Momento da última gravação bem sucedida, nesta sessão. */
  guardadoEm: Date | null;
  /**
   * Persiste a regra. Aceita o grafo já alterado porque quem chama logo a
   * seguir a um `setNodes` ainda não o vê aplicado — gravava o estado
   * anterior e a alteração perdia-se sem erro nenhum.
   */
  guardar: (nosAlterados?: Node[]) => Promise<void>;
  aGuardar: boolean;
  podeGuardar: boolean;
}

export const Contexto = createContext<EditorAutomacao | null>(null);

export function useEditorAutomacao(): EditorAutomacao {
  const valor = useContext(Contexto);
  if (!valor) throw new Error('useEditorAutomacao fora do EditorAutomacaoProvider');
  return valor;
}
