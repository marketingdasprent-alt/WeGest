import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert } from '@/integrations/supabase/types';
import type { ReservaExtra, ExtraFormItem } from '@/types/reserva';

const QUERY_KEY_BASE = ['renting', 'reserva-extras'] as const;

/** Custo de um extra: 'fixo' = preço × qtd ; 'dia' = preço × qtd × dias. */
export function calcExtraTotal(item: ExtraFormItem, dias: number): number {
  const base = item.preco_unidade * item.quantidade;
  return item.tipo_calculo === 'fixo' ? base : base * dias;
}

/** Carrega os extras de uma reserva. */
export function useReservaExtras(reservaId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, reservaId ?? null],
    queryFn: async (): Promise<ReservaExtra[]> => {
      if (!reservaId) return [];
      const { data, error } = await supabase
        .from('reserva_extras')
        .select(
          'id, org_id, reserva_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total, created_by, created_at'
        )
        .eq('reserva_id', reservaId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ReservaExtra[];
    },
    enabled: !!reservaId,
    staleTime: 30_000,
  });
}

interface SyncArgs {
  reservaId: string;
  desejados: ExtraFormItem[];
  /** Nº de dias da reserva — necessário para o total dos extras 'dia'. */
  dias: number;
}

/**
 * Sincroniza os extras de uma reserva (replace-all): apaga as linhas
 * actuais e reinsere as desejadas. O `total` depende de quantidade e
 * dias (que mudam) — reinserir garante que fica sempre fresco.
 */
export function useSyncReservaExtras() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reservaId, desejados, dias }: SyncArgs): Promise<void> => {
      const { error: delErr } = await supabase
        .from('reserva_extras')
        .delete()
        .eq('reserva_id', reservaId);
      if (delErr) throw delErr;

      if (desejados.length === 0) return;

      const rows = desejados.map((e) => ({
        reserva_id: reservaId,
        extra_id: e.extra_id,
        extra_nome: e.extra_nome,
        preco_unidade: e.preco_unidade,
        tipo_calculo: e.tipo_calculo,
        quantidade: e.quantidade,
        total: calcExtraTotal(e, dias),
      }));
      // org_id é preenchido por trigger na BD — daí o cast.
      const { error: insErr } = await supabase
        .from('reserva_extras')
        .insert(rows as TablesInsert<'reserva_extras'>[]);
      if (insErr) throw insErr;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [...QUERY_KEY_BASE, vars.reservaId] });
    },
  });
}
