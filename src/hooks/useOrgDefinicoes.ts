import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import type { Tables } from '@/integrations/supabase/types';
import type { ContratoModalidade } from '@/types/contratoRenting';

export type OrgDefinicoes = Tables<'org_definicoes'>;

const QUERY_KEY = ['org-definicoes'] as const;

/** Taxas de IVA por omissão (fallback se a org ainda não tem definições). */
export const IVA_DEFAULT_RENT_A_CAR = 23;
export const IVA_DEFAULT_TVDE = 6;

/**
 * Taxa de IVA a aplicar consoante a modalidade do contrato/reserva.
 * Usa a config da org; cai nos defaults de mercado se não houver.
 */
export function ivaParaModalidade(
  def: OrgDefinicoes | null | undefined,
  modalidade: ContratoModalidade
): number {
  if (modalidade === 'tvde') {
    return def?.iva_tvde ?? IVA_DEFAULT_TVDE;
  }
  return def?.iva_rent_a_car ?? IVA_DEFAULT_RENT_A_CAR;
}

/** Definições da organização actual (taxas de IVA, e futuramente outras). */
export function useOrgDefinicoes() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<OrgDefinicoes | null> => {
      // A RLS já restringe à org actual — devolve no máximo uma linha.
      const { data, error } = await supabase.from('org_definicoes').select('*').maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

type UpdateOrgDefinicoesArgs = Partial<
  Pick<OrgDefinicoes, 'iva_rent_a_car' | 'iva_tvde' | 'privacidade_por_gestor'>
>;

/** Atualiza definições da organização actual (só admin — gerido por RLS). */
export function useUpdateOrgDefinicoes() {
  const qc = useQueryClient();
  const { orgId } = useTenant();

  return useMutation({
    mutationFn: async (patch: UpdateOrgDefinicoesArgs): Promise<void> => {
      if (!orgId) throw new Error('Organização não definida');
      const { error } = await supabase.from('org_definicoes').update(patch).eq('org_id', orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
