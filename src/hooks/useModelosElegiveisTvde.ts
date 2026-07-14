import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Conjunto de modelos (modelo_id) elegíveis para TVDE.
 *
 * Um modelo é elegível se existir pelo menos uma viatura desse modelo cujo
 * tipo de frota (viatura_tipos) esteja marcado com `elegivel_tvde = true` —
 * a mesma noção usada na página de frota para distinguir viaturas TVDE de
 * carrinhas/comerciais. Derivado dos dados existentes, sem campo novo.
 *
 * Usado para:
 *   - filtrar os modelos que aparecem na aba "Modelos" de uma tarifa TVDE;
 *   - filtrar as viaturas pesquisáveis numa reserva/contrato TVDE.
 */
export function useModelosElegiveisTvde() {
  return useQuery({
    queryKey: ['modelos_elegiveis_tvde'],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('viaturas')
        .select('modelo_id, viatura_tipos!inner(elegivel_tvde)')
        .eq('viatura_tipos.elegivel_tvde', true)
        .not('modelo_id', 'is', null);
      if (error) throw error;
      return new Set(
        (data ?? [])
          .map((v) => (v as { modelo_id: string | null }).modelo_id)
          .filter((id): id is string => !!id)
      );
    },
    staleTime: 60_000,
  });
}
