import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GestorTvde {
  id: string;
  nome: string;
}

// O RPC SECURITY DEFINER devolve os gestores autorizados; consultar `profiles`
// no cliente faria a RLS parecer uma lista vazia para utilizadores sem permissão.
export function useGestoresTvde() {
  return useQuery({
    queryKey: ['gestores-tvde'],
    queryFn: async (): Promise<GestorTvde[]> => {
      const { data, error } = await supabase.rpc('get_gestores_tvde');
      if (error) throw error;
      return ((data as { id: string; nome: string }[] | null) ?? []).map((g) => ({
        id: g.id,
        nome: g.nome ?? '',
      }));
    },
    staleTime: 60_000,
  });
}

// Alguns formulários guardam o nome; deduplique perfis homónimos no seletor.
export function useGestoresTvdeNomes() {
  const { data, isLoading, isError } = useGestoresTvde();

  const gestores = useMemo(() => {
    const vistos = new Set<string>();
    const unicos: { nome: string }[] = [];
    for (const g of data ?? []) {
      if (!g.nome || vistos.has(g.nome)) continue;
      vistos.add(g.nome);
      unicos.push({ nome: g.nome });
    }
    return unicos;
  }, [data]);

  return { gestores, isLoading, isError };
}
