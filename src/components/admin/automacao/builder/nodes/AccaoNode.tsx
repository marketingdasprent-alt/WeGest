import { memo } from 'react';
import type { NodeProps } from '@realflow/react';
import type { AutomationNode } from '../dominio/tipos';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { visualDoBloco } from '../catalogo';
import { useAccoesDoNo } from './useAccoesDoNo';
import { BlocoBase } from './BlocoBase';

export interface DadosAccaoBuilder extends Record<string, unknown> {
  accao: string;
  rotulo: string;
  cooldownMinutos: number;
  cargoIds?: string[];
  enviarEmail?: boolean;
  campo?: string;
  valor?: string;
  /** Vem das estatísticas da regra, não da configuração. */
  estado?: 'normal' | 'sucesso' | 'erro';
  ativo?: boolean;
  ultimaExecucao?: string | null;
  duracaoMediaMs?: number | null;
}

export type AccaoNodeType = AutomationNode & { data: DadosAccaoBuilder };

/** Só no tooltip: a contagem de destinatários saiu do cartão. */
function detalhe(data: DadosAccaoBuilder): string {
  if (data.accao === 'notificacao') {
    const n = data.cargoIds?.length ?? 0;
    const grupos = n === 1 ? '1 grupo' : `${n} grupos`;
    return `${grupos}${data.enviarEmail ? ' · com email' : ''}`;
  }
  return data.campo ? `${data.campo} → ${data.valor || '?'}` : 'Sem campo escolhido';
}

/**
 * A linha discreta por baixo do nome.
 *
 * Duração média e há quanto tempo correu dizem mais, de relance, do que
 * "sucesso" — que já está no traço de estado.
 */
function rodape(data: DadosAccaoBuilder): string | undefined {
  if (!data.ultimaExecucao) return 'Nunca correu';
  const quando = formatDistanceToNowStrict(parseISO(data.ultimaExecucao), {
    locale: pt,
    addSuffix: true,
  });
  const duracao =
    data.duracaoMediaMs != null ? ` · ${(data.duracaoMediaMs / 1000).toFixed(1)}s` : '';
  return quando + duracao;
}

function faltaConfigurar(data: DadosAccaoBuilder): boolean {
  if (data.accao === 'notificacao') return (data.cargoIds?.length ?? 0) === 0;
  if (data.accao === 'alterar_estado') return !data.campo || !data.valor;
  return false;
}

function AccaoNodeBase({ id, data, selected }: NodeProps<DadosAccaoBuilder>) {
  const visual = visualDoBloco('accao', { accao: data.accao });
  const { remover } = useAccoesDoNo(id);

  return (
    <BlocoBase
      cor={visual.cor}
      Icone={visual.Icone}
      etiqueta="Então"
      forma="accao"
      titulo={data.rotulo}
      detalhe={detalhe(data)}
      rodape={rodape(data)}
      seleccionado={selected}
      incompleto={faltaConfigurar(data)}
      estado={data.estado}
      ativo={data.ativo}
      onRemover={remover}
    />
  );
}

export const AccaoNode = memo(AccaoNodeBase);
