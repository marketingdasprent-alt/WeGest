import { useCallback } from 'react';
import { useEditorAutomacao } from '../editorAutomacao.contexto';

/**
 * As acções que a barra de hover de um nó dispara.
 *
 * Passou a usar o contexto do editor em vez da API da biblioteca de canvas.
 * O editor é dono do grafo — mandar a biblioteca mexer nele e esperar que a
 * alteração voltasse por um callback era um caminho a mais para o mesmo sítio,
 * e prendia mais um ficheiro à biblioteca sem necessidade.
 */
export function useAccoesDoNo(id: string) {
  const { setNodes, setEdges } = useEditorAutomacao();

  const remover = useCallback(() => {
    setNodes((nos) => nos.filter((n) => n.id !== id));
    // As arestas órfãs saem com ele: deixá-las fazia o payload ser rejeitado
    // por causa de uma ponta solta que o utilizador nem vê.
    setEdges((ligacoes) => ligacoes.filter((e) => e.source !== id && e.target !== id));
  }, [setNodes, setEdges, id]);

  /**
   * Liga/desliga a regra. Só o nó de gatilho o oferece: `ativo` é uma
   * propriedade da REGRA, não de um passo, e o gatilho é quem a representa.
   * A escrita acontece ao Guardar, como o resto do fluxo.
   */
  const alternarAtivo = useCallback(() => {
    setNodes((nos) =>
      nos.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, ativo: !(n.data as { ativo?: boolean }).ativo } }
          : n
      )
    );
  }, [setNodes, id]);

  return { remover, alternarAtivo };
}
