import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { EscopoApi } from '@/lib/apiChaves';
import { errorMessage } from '@/utils/errorMessage';

export interface ApiChaveRow {
  id: string;
  nome: string;
  escopo: EscopoApi;
  prefixo: string | null;
  permissoes: string[];
  ativo: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  total_requests: number;
  created_at: string;
}

// Por coluna, de propósito: api_key, api_secret e api_key_hash estão vedados a
// authenticated (GRANT por coluna). select('*') responde 42501.
export const COLUNAS_API_CHAVES =
  'id, nome, escopo, prefixo, permissoes, ativo, expires_at, last_used_at, total_requests, created_at';

const CHAVE_QUERY = ['api-chaves'] as const;

export function useApiChaves() {
  return useQuery({
    queryKey: CHAVE_QUERY,
    queryFn: async (): Promise<ApiChaveRow[]> => {
      const { data, error } = await supabase
        .from('api_chaves')
        .select(COLUNAS_API_CHAVES)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ApiChaveRow[];
    },
  });
}

export interface CriarApiChaveInput {
  nome: string;
  escopo: EscopoApi;
  permissoes: string[];
  expiraEm: string | null;
  ipWhitelist: string[];
}

export interface ApiChaveCriada {
  id: string;
  chave: string;
  prefixo: string;
}

export function useCriarApiChave() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    // A resposta traz a chave em claro: não fica no MutationCache depois de o
    // diálogo a largar (gcTime 0 + reset() no diálogo).
    gcTime: 0,
    mutationFn: async (input: CriarApiChaveInput): Promise<ApiChaveCriada> => {
      // O gerador de tipos marca todos os argumentos como obrigatórios; a RPC
      // aceita null em p_expira_em e p_ip_whitelist (sem validade / sem whitelist).
      const { data, error } = await supabase.rpc('api_chaves_criar', {
        p_nome: input.nome,
        p_escopo: input.escopo,
        p_permissoes: input.permissoes,
        p_expira_em: input.expiraEm ?? (null as unknown as string),
        p_ip_whitelist: input.ipWhitelist.length
          ? input.ipWhitelist
          : (null as unknown as string[]),
      });
      if (error) throw error;
      const linha = Array.isArray(data) ? data[0] : data;
      if (!linha) throw new Error('A chave não foi criada.');
      return linha;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE_QUERY }),
    onError: (e: unknown) =>
      toast({
        title: 'Erro a criar a chave',
        description: errorMessage(e),
        variant: 'destructive',
      }),
  });
}

export function useDesativarApiChave() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('api_chaves_desativar', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHAVE_QUERY });
      toast({ title: 'Chave desactivada' });
    },
    onError: (e: unknown) =>
      toast({ title: 'Erro', description: errorMessage(e), variant: 'destructive' }),
  });
}
