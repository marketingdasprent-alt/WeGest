import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert } from '@/integrations/supabase/types';
import type { ReservaCobertura } from '@/types/reserva';
import type { CoberturaFormItem } from '@/types/contratoRenting';

const QUERY_KEY_BASE = ['renting', 'reserva-coberturas'] as const;

/** Carrega as coberturas de uma reserva. */
export function useReservaCoberturas(reservaId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, reservaId ?? null],
    queryFn: async (): Promise<ReservaCobertura[]> => {
      if (!reservaId) return [];
      const { data, error } = await supabase
        .from('reserva_coberturas')
        .select(
          'id, org_id, reserva_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor, created_by, created_at'
        )
        .eq('reserva_id', reservaId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ReservaCobertura[];
    },
    enabled: !!reservaId,
    staleTime: 30_000,
  });
}

interface SyncArgs {
  reservaId: string;
  desejadas: CoberturaFormItem[];
}

/**
 * Sincroniza as coberturas de uma reserva contra o estado actual na BD:
 *   • Apaga as que já não estão seleccionadas.
 *   • Insere as novas com snapshot do catálogo.
 *   • As existentes ficam intactas — o snapshot mantém-se congelado.
 */
export function useSyncReservaCoberturas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reservaId, desejadas }: SyncArgs): Promise<void> => {
      const { data: actuais, error: fetchErr } = await supabase
        .from('reserva_coberturas')
        .select('id, cobertura_id')
        .eq('reserva_id', reservaId);
      if (fetchErr) throw fetchErr;

      const actuaisPorCobertura = new Map((actuais ?? []).map((c) => [c.cobertura_id, c]));
      const desejadasIds = new Set(desejadas.map((c) => c.cobertura_id));

      // 1) Apagar as que sobram
      const idsApagar = (actuais ?? [])
        .filter((c) => !desejadasIds.has(c.cobertura_id))
        .map((c) => c.id);
      if (idsApagar.length > 0) {
        const { error } = await supabase.from('reserva_coberturas').delete().in('id', idsApagar);
        if (error) throw error;
      }

      // 2) Inserir as novas (snapshot vem do form item)
      const aInserir = desejadas
        .filter((c) => !actuaisPorCobertura.has(c.cobertura_id))
        .map((c) => ({
          reserva_id: reservaId,
          cobertura_id: c.cobertura_id,
          cobertura_nome: c.cobertura_nome,
          preco_dia: c.preco_dia,
          franquia_valor: c.franquia_valor,
        }));
      if (aInserir.length > 0) {
        // org_id é preenchido por trigger na BD — daí o cast.
        const { error } = await supabase
          .from('reserva_coberturas')
          .insert(aInserir as TablesInsert<'reserva_coberturas'>[]);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [...QUERY_KEY_BASE, vars.reservaId] });
    },
  });
}
