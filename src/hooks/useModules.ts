import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Modulo, OrganizacaoModulo } from '@/types/modulo';

type ModulesQueryResult = {
  modulos: OrganizacaoModulo[];
  tabelaAusente: boolean;
};

// Enquanto a migração não existe, falhe aberto para não bloquear funcionalidades.
export function useModules() {
  const query = useQuery<ModulesQueryResult>({
    queryKey: ['organizacao_modulos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizacao_modulos')
        .select('*')
        .eq('ativo', true);

      if (error) {
        const code = (error as { code?: string }).code;
        const message = error instanceof Error ? error.message : String(error);
        if (code === '42P01' || message.includes('organizacao_modulos')) {
          console.warn('[useModules] tabela organizacao_modulos ausente — modo fail-open');
          return { modulos: [], tabelaAusente: true };
        }
        throw error;
      }
      return { modulos: (data ?? []) as OrganizacaoModulo[], tabelaAusente: false };
    },
    staleTime: 5 * 60 * 1000, // 5 min — mudanças são raras (admin only)
  });

  const activos = useMemo(
    () => new Set((query.data?.modulos ?? []).map((m) => m.modulo)),
    [query.data]
  );

  const tabelaAusente = query.data?.tabelaAusente ?? false;

  const has = (modulo: Modulo) => tabelaAusente || activos.has(modulo);

  return {
    ...query,
    modulos: query.data?.modulos ?? [],
    activos,
    has,
    tabelaAusente,
  };
}
