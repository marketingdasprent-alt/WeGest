import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert } from '@/integrations/supabase/types';
import type { ContratoPrestacaoNovo } from '@/utils/contratoPrestacao';

export interface ContratoPrestacaoRef {
  id: string;
  codigo: number | null;
}

const QUERY_KEY = 'contratos-prestacao';

/** Contrato de prestação ativo da reserva Slot (no máximo um). */
export function useContratoPrestacaoDaReserva(reservaId: string | null | undefined) {
  return useQuery({
    queryKey: [QUERY_KEY, { reservaId: reservaId ?? null }],
    queryFn: async (): Promise<ContratoPrestacaoRef | null> => {
      if (!reservaId) return null;
      const { data, error } = await supabase
        .from('contratos_prestacao')
        .select('id, codigo')
        .eq('reserva_id', reservaId)
        .eq('estado', 'ativo')
        .is('deleted_at', null)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!reservaId,
    staleTime: 30_000,
  });
}

export function useCreateContratoPrestacao() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (contrato: ContratoPrestacaoNovo): Promise<ContratoPrestacaoRef> => {
      // `codigo` é NOT NULL sem default nos tipos, mas quem o preenche é o trigger
      // BEFORE INSERT `trg_contrato_prestacao_codigo_por_org` (numeração por organização).
      const { data, error } = await supabase
        .from('contratos_prestacao')
        .insert(contrato as TablesInsert<'contratos_prestacao'>)
        .select('id, codigo')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
