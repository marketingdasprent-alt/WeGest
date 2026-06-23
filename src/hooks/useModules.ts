import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Modulo, OrganizacaoModulo } from '@/types/modulo';

type ModulesQueryResult = {
  modulos: OrganizacaoModulo[];
  /** true se a tabela não existe (migração ainda não aplicada). */
  tabelaAusente: boolean;
};

/**
 * Lê os módulos activos da organização actual.
 *
 * RLS filtra automaticamente por `org_id = get_current_org_id()` — não é
 * preciso passar org_id na query.
 *
 * **Política fail-open:** se a tabela `organizacao_modulos` ainda não existir
 * (migração nova por aplicar), `has(modulo)` devolve `true` para todos os
 * módulos. Evita bloquear o produto enquanto a Fase 1 não é exercida em
 * produção. Quando a tabela passar a existir e tiver linhas, o
 * comportamento estrito ressurge automaticamente.
 *
 * Uso típico:
 *   const { has, isLoading } = useModules();
 *   if (!isLoading && !has('tvde')) return <NotEnabled module="tvde" />;
 */
export function useModules() {
  const query = useQuery<ModulesQueryResult>({
    queryKey: ['organizacao_modulos'],
    queryFn: async () => {
      // Tabela ainda não está nos tipos auto-gerados (migração nova); cast até regenerar.
      const { data, error } = await (supabase as any)
        .from('organizacao_modulos')
        .select('*')
        .eq('ativo', true);

      if (error) {
        // 42P01 = undefined_table → migração ainda não aplicada → fail-open
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

  // fail-open: se a tabela não existe, todos os módulos contam como activos.
  const has = (modulo: Modulo) => tabelaAusente || activos.has(modulo);

  return {
    ...query,
    modulos: query.data?.modulos ?? [],
    activos,
    has,
    tabelaAusente,
  };
}
