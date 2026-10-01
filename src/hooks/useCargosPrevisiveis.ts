import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { CARGO_MOTORISTA_ID } from '@/contexts/PermissionsContext';
import { cargoPrevisivel } from '@/lib/verComoGrupo';

/** Grupos da org que o admin pode pré-visualizar: sem Motorista e sem os de admin. */
export function useCargosPrevisiveis(orgId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['cargos', { orgId, previsiveis: true }],
    enabled: enabled && !!orgId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cargos')
        .select('id, nome')
        .eq('org_id', orgId ?? '')
        .neq('id', CARGO_MOTORISTA_ID)
        .order('nome');
      if (error) throw error;
      return (data ?? []).filter((c) => cargoPrevisivel(c.nome));
    },
  });
}
