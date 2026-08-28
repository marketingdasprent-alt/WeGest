import { memo } from 'react';
import type { NodeProps } from '@realflow/react';
import type { AutomationNode } from '../dominio/tipos';
import { OPERADORES, visualDoBloco } from '../catalogo';
import { useAccoesDoNo } from './useAccoesDoNo';
import { BlocoBase } from './BlocoBase';

export interface DadosCondicaoBuilder extends Record<string, unknown> {
  rotulo: string;
  campo: string;
  operador: string;
  valor: string;
}

export type CondicaoNodeType = AutomationNode & { data: DadosCondicaoBuilder };

function detalhe(data: DadosCondicaoBuilder): string {
  if (!data.campo) return 'Sem campo escolhido';
  const op = OPERADORES.find((o) => o.valor === data.operador)?.rotulo ?? data.operador;
  return `${data.campo} ${op} "${data.valor}"`;
}

function CondicaoNodeBase({ id, data, selected }: NodeProps<DadosCondicaoBuilder>) {
  const visual = visualDoBloco('condicao', {});
  const { remover } = useAccoesDoNo(id);

  return (
    <BlocoBase
      cor={visual.cor}
      Icone={visual.Icone}
      etiqueta="Só se"
      forma="condicao"
      titulo={data.rotulo}
      detalhe={detalhe(data)}
      seleccionado={selected}
      incompleto={!data.campo}
      onRemover={remover}
    />
  );
}

export const CondicaoNode = memo(CondicaoNodeBase);
