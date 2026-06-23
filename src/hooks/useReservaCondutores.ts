import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert } from '@/integrations/supabase/types';
import type { CondutorFormItem, ReservaCondutor } from '@/types/reserva';

const QUERY_KEY_BASE = ['renting', 'reserva-condutores'] as const;

/** Chave estável: cliente_id em rent-a-car, motorista_id em TVDE. */
function chaveCondutor(c: { cliente_id: string | null; motorista_id: string | null }): string {
  return (c.cliente_id ?? c.motorista_id) as string;
}

/** Carrega os condutores de uma reserva. */
export function useReservaCondutores(reservaId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY_BASE, reservaId ?? null],
    queryFn: async (): Promise<ReservaCondutor[]> => {
      if (!reservaId) return [];
      const { data, error } = await supabase
        .from('reserva_condutores')
        .select(
          'id, org_id, reserva_id, cliente_id, motorista_id, is_principal, created_by, created_at'
        )
        .eq('reserva_id', reservaId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ReservaCondutor[];
    },
    enabled: !!reservaId,
    staleTime: 30_000,
  });
}

interface SyncArgs {
  reservaId: string;
  desejados: CondutorFormItem[];
}

/**
 * Sincroniza a lista de condutores duma reserva contra o estado actual na BD.
 * Identifica linhas por `cliente_id` ou `motorista_id` (exactamente um dos dois).
 */
export function useSyncReservaCondutores() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reservaId, desejados }: SyncArgs): Promise<void> => {
      const { data: actuais, error: fetchErr } = await supabase
        .from('reserva_condutores')
        .select('id, cliente_id, motorista_id, is_principal')
        .eq('reserva_id', reservaId);
      if (fetchErr) throw fetchErr;

      const actuaisPorChave = new Map((actuais ?? []).map((c) => [chaveCondutor(c), c]));
      const desejadosChaves = new Set(desejados.map(chaveCondutor));

      // 1) Apagar os que sobram
      const idsApagar = (actuais ?? [])
        .filter((c) => !desejadosChaves.has(chaveCondutor(c)))
        .map((c) => c.id);
      if (idsApagar.length > 0) {
        const { error } = await supabase.from('reserva_condutores').delete().in('id', idsApagar);
        if (error) throw error;
      }

      // 2) Inserir os que faltam (sempre is_principal=false; corrigimos depois)
      const aInserir = desejados
        .filter((c) => !actuaisPorChave.has(chaveCondutor(c)))
        .map((c) => ({
          reserva_id: reservaId,
          cliente_id: c.cliente_id,
          motorista_id: c.motorista_id,
          is_principal: false,
        }));
      if (aInserir.length > 0) {
        const { error } = await supabase
          .from('reserva_condutores')
          .insert(aInserir as TablesInsert<'reserva_condutores'>[]);
        if (error) throw error;
      }

      // 3) Resetar todos para is_principal=false
      const { error: errReset } = await supabase
        .from('reserva_condutores')
        .update({ is_principal: false })
        .eq('reserva_id', reservaId)
        .eq('is_principal', true);
      if (errReset) throw errReset;

      // 4) Marcar o principal desejado (se houver)
      const principal = desejados.find((c) => c.is_principal);
      if (principal) {
        let q = supabase
          .from('reserva_condutores')
          .update({ is_principal: true })
          .eq('reserva_id', reservaId);
        if (principal.cliente_id) {
          q = q.eq('cliente_id', principal.cliente_id);
        } else if (principal.motorista_id) {
          q = q.eq('motorista_id', principal.motorista_id);
        }
        const { error } = await q;
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: [...QUERY_KEY_BASE, vars.reservaId] });
      qc.invalidateQueries({ queryKey: ['renting', 'reservas'] });
    },
  });
}
