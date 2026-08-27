import type { NodeTypes } from '@realflow/react';
import { AccaoNode } from './AccaoNode';
import { CondicaoNode } from './CondicaoNode';
import { ErroNode } from './ErroNode';
import { TriggerNode } from './TriggerNode';

/**
 * Fora do componente: um objecto novo a cada render faz o React Flow
 * desmontar e remontar todos os nós — perde-se o estado e o canvas pisca.
 */
export const nodeTypesBuilder: NodeTypes = {
  trigger: TriggerNode,
  condicao: CondicaoNode,
  accao: AccaoNode,
  erro: ErroNode,
};
