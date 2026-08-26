import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GestorTvde {
  /** profiles.id — é o que contratos/reservas guardam em `gestor_id`. */
  id: string;
  nome: string;
}

/**
 * Gestores TVDE da organização activa — FONTE ÚNICA para todos os selectores
 * de "Gestor" da aplicação.
 *
 * Vem do RPC `get_gestores_tvde` e nunca de `profiles` directamente. Ler
 * `profiles` no cliente parece funcionar (quem testa costuma ser admin) mas
 * devolve lista VAZIA a qualquer não-admin: a policy `mt_profiles_select` só
 * deixa ver a própria linha sem `calendario_ver_gestores`/`admin_utilizadores`.
 * E como a RLS filtra linhas em vez de dar erro, o resultado é um `[]` com
 * HTTP 200 — impossível de distinguir de "não há gestores". Foi exactamente
 * assim que este bug sobreviveu a uma primeira correcção: havia três cópias
 * desta lógica e só uma foi corrigida.
 *
 * O RPC é SECURITY DEFINER, resolve a org do lado do servidor e devolve apenas
 * id + nome. Se precisares desta lista noutro sítio, usa este hook — não
 * escrevas outra query a `profiles`.
 */
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

/**
 * Mesma lista, reduzida a nomes únicos — para os selectores que guardam o
 * NOME em vez do id (ficha do motorista e diálogo de novo motorista, ambos
 * escrevem `motoristas_ativos.gestor_responsavel`, que é text).
 *
 * A deduplicação por nome é necessária porque a org pode ter dois perfis
 * distintos com o mesmo nome (caso real em produção: "Juliano Cury"
 * duplicado). Sem isto apareceria a mesma pessoa duas vezes, indistinguível.
 */
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
