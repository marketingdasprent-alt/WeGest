import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Contagem ao vivo de destinatários de uma lista (manual ou audiência automática). */
export function useMarketingListaContagem(listaId?: string, enabled = true) {
  return useQuery({
    queryKey: ['marketing-lista-contagem', listaId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('marketing_lista_contagem', {
        p_lista_id: listaId as string,
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    enabled: enabled && !!listaId,
  });
}
