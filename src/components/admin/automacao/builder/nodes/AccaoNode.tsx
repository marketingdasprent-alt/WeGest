import { memo } from 'react';
import type { NodeProps } from '@realflow/react';
import type { AutomationNode } from '../dominio/tipos';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { visualDoBloco } from '../catalogo';
import { useAccoesDoNo } from './useAccoesDoNo';
import { BlocoBase } from './BlocoBase';

export interface DadosAccaoBuilder extends Record<string, unknown> {
  /** Para notificações é 'notificacao'; para acções internas é o id do catálogo. */
  accao: string;
  /** 'notificacao' | 'automacao_interna'. */
  acaoTipo?: string;
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
  if (data.acaoTipo === 'automacao_interna') {
    if (!data.accao) return 'Sem acção escolhida';
    // O campo só existe nas acções que escrevem num campo; as de conjunto
    // fechado têm só o valor.
    const alvo = data.campo ? `${data.campo} → ` : '';
    return `${alvo}${data.valor || '?'}`;
  }
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
  // Numa acção interna o `campo` só existe nas que escrevem num campo; exigi-lo
  // sempre marcava como incompleta uma acção de conjunto fechado já correcta.
  if (data.acaoTipo === 'automacao_interna') return !data.accao || !data.valor;
  if (data.accao === 'notificacao') return (data.cargoIds?.length ?? 0) === 0;
  return false;
}

function AccaoNodeBase({ id, data, selected }: NodeProps<DadosAccaoBuilder>) {
  const visual = visualDoBloco('accao', { accao: data.accao, acaoTipo: data.acaoTipo });
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
