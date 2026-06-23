import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type ContratoHistoricoEventoTipo =
  | 'reserva_criada'
  | 'contrato_aberto'
  | 'contrato_fechado'
  | 'contrato_faturado'
  | 'ultima_alteracao';

export interface ContratoHistoricoEvento {
  evento_tipo: ContratoHistoricoEventoTipo;
  ator_id: string | null;
  ator_nome: string | null;
  detalhe: string | null;
  criado_em: string;
}

/**
 * Histórico de edições do contrato — marcos do ciclo de vida (reserva criada,
 * contrato aberto/fechado/faturado) + última alteração, com o nome do ator já
 * resolvido pela RPC `contrato_historico_resumo`.
 */
export function useContratoHistorico(contratoId: string | null | undefined) {
  return useQuery({
    queryKey: ['contrato-historico', contratoId ?? null],
    queryFn: async (): Promise<ContratoHistoricoEvento[]> => {
      if (!contratoId) return [];
      const { data, error } = await supabase.rpc('contrato_historico_resumo', {
        p_contrato_id: contratoId,
      });
      if (error) throw error;
      return (data ?? []) as ContratoHistoricoEvento[];
    },
    enabled: !!contratoId,
    staleTime: 15_000,
  });
}
