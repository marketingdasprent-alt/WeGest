import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

// `motoristas_ativos` é uma TABELA (a ficha do motorista), apesar do nome
// parecer uma view sobre `motoristas`.
export type MotoristaAtivo = Database['public']['Tables']['motoristas_ativos']['Row'];

/**
 * A ficha do motorista com sessão iniciada, para o portal dele.
 *
 * `limit(1)` em vez de `single()`: há fichas duplicadas na base (mesmo NIF,
 * mesmo utilizador) e um `single()` rebentava o painel inteiro por causa
 * disso. Fica com a mais antiga, que é a que tem histórico.
 */
export function useMotoristaAtivo(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['motorista-ativo', userId],
    enabled: !!userId,
    queryFn: async (): Promise<MotoristaAtivo | null> => {
      const { data, error } = await supabase
        .from('motoristas_ativos')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: true })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });
}
