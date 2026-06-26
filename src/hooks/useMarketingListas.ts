import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MarketingListaOpcao {
  id: string;
  nome: string;
  origem: string;
}

/**
 * Listas de transmissão (id/nome/origem) para os seletores de campanha.
 * Fonte única partilhada por NovaCampanhaDialog e EnviarCampanhaDialog.
 * Nota: ListasTab usa a sua própria query — precisa do agregado de contagem.
 */
export function useMarketingListas(enabled = true) {
  return useQuery({
    queryKey: ['marketing-listas-opcoes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('marketing_listas')
        .select('id, nome, origem')
        .order('nome');
      if (error) throw error;
      return (data ?? []) as MarketingListaOpcao[];
    },
    enabled,
  });
}
