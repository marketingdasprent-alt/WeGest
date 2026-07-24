import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface DanoCategoriaOption {
  id: string;
  nome: string;
  cor: string | null;
}

/** Categorias ativas disponíveis para classificar um dano (partilhadas com
 * assistencia_categorias, incl. "Sinistro"), ordenadas para exibição num
 * <Select>. */
export function useDanoCategorias() {
  return useQuery({
    queryKey: ['dano-categorias'],
    queryFn: async (): Promise<DanoCategoriaOption[]> => {
      const { data, error } = await supabase
        .from('assistencia_categorias')
        .select('id, nome, cor')
        .eq('ativo', true)
        .order('ordem', { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });
}
