import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ViaturaBasic } from './useViaturas';

/**
 * Carros slot ligados a um motorista (via motorista_viaturas, associação
 * activa) — usado no regime slot para listar "os carros deste motorista".
 * Só devolve viaturas marcadas is_slot=true.
 */
export function useMotoristaSlotViaturas(motoristaId: string | null | undefined) {
  return useQuery({
    queryKey: ['motorista-slot-viaturas', motoristaId ?? null],
    enabled: !!motoristaId,
    queryFn: async (): Promise<ViaturaBasic[]> => {
      if (!motoristaId) return [];
      const { data, error } = await supabase
        .from('motorista_viaturas')
        .select(
          `viatura_id,
           viaturas:viatura_id (
             id, matricula, marca, modelo, status, categoria,
             km_atual, combustivel, is_vendida, is_slot, grupo_id, habilitada_tvde
           )`
        )
        .eq('motorista_id', motoristaId)
        .is('data_fim', null);

      if (error) throw error;

      return (data ?? [])
        .map((row: any) => row.viaturas)
        .filter((v: any) => v && v.is_slot === true) as ViaturaBasic[];
    },
  });
}
