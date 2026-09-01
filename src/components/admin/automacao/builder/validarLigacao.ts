import type { AutomationNode as Node, AutomationEdge as Edge } from './dominio/tipos';

/**
 * A árvore que o canvas impõe: um nó só pode ter UMA ligação a entrar, e uma
 * acção nunca pode ter ligações a sair.
 *
 * Sem isto, o traçado de que condições pertencem a que acção fica ambíguo —
 * um nó com duas entradas herdaria condições de dois caminhos diferentes.
 * Sem a segunda regra, seria possível encadear acção→acção, que é
 * encadeamento sequencial — fora de âmbito nesta fase (ver a spec).
 */
export function validarLigacao(
  candidato: { source: string; target: string },
  nodes: Node[],
  edges: Edge[]
): true | string {
  const origem = nodes.find((n) => n.id === candidato.source);

  if (origem?.type === 'accao') {
    return 'Uma acção não pode ligar a outra — ainda não é suportado.';
  }

  const alvoJaTemEntrada = edges.some((e) => e.target === candidato.target);
  if (alvoJaTemEntrada) {
    return 'Este passo já tem uma ligação a entrar.';
  }

  return true;
}
