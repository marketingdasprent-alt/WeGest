import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Modelos (modelo_id) elegíveis para TVDE: existe pelo menos uma viatura
 * desse modelo com `viatura_tipos.elegivel_tvde = true` — derivado dos dados
 * existentes, sem campo novo. Usado para filtrar tarifas e reservas TVDE.
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
