import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Colaborador } from '@/types/movimento';

interface UseColaboradoresOptions {
  /** Se false, a query não é executada */
  enabled?: boolean;
}

/**
 * Lista os colaboradores internos (utilizadores) da organização atual.
 *
 * Estratégia:
 *  1. Tenta o RPC `listar_colaboradores` (SECURITY DEFINER — funciona mesmo
 *     com RLS restritiva em `profiles`).
 *  2. Se devolver vazio (por exemplo sessão sem org ativa) cai num
 *     `select` directo a `profiles`, que devolve o que a RLS permitir
 *     ao utilizador (admin vê todos, restantes vêem o seu).
 */
export function useColaboradores(options: UseColaboradoresOptions = {}) {
  const { enabled = true } = options;

  return useQuery({
    queryKey: ['colaboradores'],
    queryFn: async (): Promise<Colaborador[]> => {
      const rpcResult = await supabase.rpc('listar_colaboradores');

      if (!rpcResult.error && rpcResult.data && rpcResult.data.length > 0) {
        return rpcResult.data as Colaborador[];
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome')
        .not('nome', 'is', null)
        .order('nome');

      if (error) throw error;

      return (data ?? [])
        .filter((p): p is { id: string; nome: string } => !!p.id && !!p.nome)
        .map((p) => ({ id: p.id, nome: p.nome }));
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}
