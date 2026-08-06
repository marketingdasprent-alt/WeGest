import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GestorTvde {
  nome: string;
}

/**
 * Gestores TVDE da org activa.
 *
 * Vem do RPC `get_gestores_tvde` e não de `user_organizacoes` directamente:
 * essa tabela só deixa cada utilizador ver a SUA linha (ou tudo, se for
 * admin), pelo que a lista saía VAZIA para toda a gente que não fosse
 * administrador — incluindo cargos com `motoristas_editar`, que têm
 * precisamente de preencher este campo. `profiles` impunha a mesma barreira
 * logo a seguir. O RPC é SECURITY DEFINER, devolve só nomes e faz o gate no
 * servidor, sem alargar nenhuma política.
 *
 * `orgId` já não filtra (a função resolve a org da sessão) — fica como chave
 * de cache e para não disparar antes de a org estar escolhida.
 */
export function useGestoresTvde(orgId: string | null): GestorTvde[] {
  const { data = [] } = useQuery({
    queryKey: ['gestores-tvde', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<GestorTvde[]> => {
      const { data, error } = await supabase.rpc('get_gestores_tvde');
      if (error) throw error;
      return ((data as { nome: string }[] | null) ?? []).map((g) => ({ nome: g.nome }));
    },
  });

  return data;
}
