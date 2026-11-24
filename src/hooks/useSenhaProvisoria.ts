import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SenhaProvisoria {
  por_trocar: boolean;
  expira_em: string | null;
}

export const SENHA_PROVISORIA_KEY = ['senha-provisoria'] as const;

export function useSenhaProvisoria(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: SENHA_PROVISORIA_KEY,
    enabled: options.enabled ?? true,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<SenhaProvisoria | null> => {
      // RPC da migração 20261125100000; types.ts é regenerado depois de aplicada.
      const { data, error } = await supabase.rpc('minha_senha_provisoria' as never);
      // Falha aberta: a troca obrigatória é só de ecrã, e um erro aqui não pode
      // prender o motorista no "A carregar" (ex.: antes de a migração estar aplicada).
      if (error) {
        console.warn('minha_senha_provisoria falhou:', error.message);
        return null;
      }
      const linhas = (data ?? []) as unknown as SenhaProvisoria[];
      return linhas[0] ?? null;
    },
  });
}
