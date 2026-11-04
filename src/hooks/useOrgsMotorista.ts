import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';

export interface OrgDoMotorista {
  orgId: string;
  nome: string;
  fichaAtiva: boolean;
}

/** Organizações onde o motorista com sessão tem ficha (ativas primeiro). */
export function useOrgsMotorista(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['orgs-motorista', userId],
    enabled: !!userId,
    queryFn: async (): Promise<OrgDoMotorista[]> => {
      const { data, error } = await supabase.rpc('minhas_orgs_motorista');
      if (error) throw error;
      return (data ?? []).map((o) => ({
        orgId: o.org_id,
        nome: o.org_nome,
        fichaAtiva: o.ficha_ativa,
      }));
    },
  });
}
