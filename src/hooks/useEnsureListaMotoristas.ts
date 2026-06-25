import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Garante (cria se faltar) a lista de sistema "Motoristas Ativos" da org atual. */
export function useEnsureListaMotoristas() {
  return useQuery({
    queryKey: ['ensure-lista-motoristas'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ensure_lista_motoristas');
      if (error) throw error;
      return data;
    },
    staleTime: Infinity,
    retry: false,
  });
}
