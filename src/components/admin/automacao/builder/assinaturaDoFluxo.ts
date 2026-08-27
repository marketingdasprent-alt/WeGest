import type { AutomationEdge as Edge, AutomationNode as Node } from './dominio/tipos';
import { serializarFluxo } from './serializar';

/**
 * Impressão digital da LÓGICA do fluxo, para saber se há algo por guardar.
 *
 * Deliberadamente cega à posição: o layout não é gravado em lado nenhum, por
 * isso arrastar um bloco não é uma alteração por guardar. Se contasse, o badge
 * acendia ao primeiro arrasto e pedia para gravar uma coisa que não muda nada.
 *
 * Ordena por id porque apagar e voltar a acrescentar um bloco reordena o array
 * sem mudar nada do que vai para a base de dados.
 */
export function assinaturaDoFluxo(nodes: Node[], edges: Edge[]): string {
  const { nos, ligacoes } = serializarFluxo(nodes, edges);

  return JSON.stringify({
    nos: [...nos].sort((a, b) => a.id.localeCompare(b.id)),
    ligacoes: [...ligacoes].sort((a, b) => `${a.de}${a.para}`.localeCompare(`${b.de}${b.para}`)),
  });
}
