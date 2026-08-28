import { memo } from 'react';
import type { NodeProps } from '@realflow/react';
import type { AutomationNode } from '../dominio/tipos';
import { rotuloDoEvento, visualDoBloco } from '../catalogo';
import { useAccoesDoNo } from './useAccoesDoNo';
import { BlocoBase } from './BlocoBase';

export interface DadosTrigger extends Record<string, unknown> {
  modulo: string;
  rotulo: string;
  /** Escolhido no modal. Sem ele o fluxo não dispara. */
  eventType: string | null;
  /** Estado da regra, quando o fluxo vem de uma regra existente. */
  ativo?: boolean;
}

export type TriggerNodeType = AutomationNode & { data: DadosTrigger };

function TriggerNodeBase({ id, data, selected }: NodeProps<DadosTrigger>) {
  const visual = visualDoBloco('trigger', { modulo: data.modulo });
  const { remover, alternarAtivo } = useAccoesDoNo(id);

  return (
    <BlocoBase
      cor={visual.cor}
      Icone={visual.Icone}
      etiqueta="Quando"
      forma="gatilho"
      titulo={data.rotulo}
      // O nome técnico do evento saiu do cartão — aqui é que se consulta,
      // com o nome legível por cima.
      detalhe={
        data.eventType ? (
          <span className="block">
            {rotuloDoEvento(data.eventType)}
            <span className="mt-0.5 block font-mono text-[10px] opacity-70">{data.eventType}</span>
          </span>
        ) : undefined
      }
      seleccionado={selected}
      incompleto={!data.eventType}
      ativo={data.ativo}
      onLigar={alternarAtivo}
      onRemover={remover}
      // Um gatilho é o início da corrente: nada corre antes dele.
      entrada={false}
    />
  );
}

export const TriggerNode = memo(TriggerNodeBase);
