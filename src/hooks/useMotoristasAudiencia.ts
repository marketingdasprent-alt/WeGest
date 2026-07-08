import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MotoristaAudiencia {
  id: string;
  nome: string | null;
  email: string;
}

/**
 * Membros ao vivo da audiência "Motoristas Ativos" (preview).
 * Critério canónico: status_ativo + email válido + não-rascunho.
 * org_id é filtrado automaticamente pela RLS no cliente.
 */
export function useMotoristasAudiencia(enabled = true) {
  return useQuery({
    queryKey: ['motoristas-audiencia'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('motoristas_ativos')
        .select('id, nome, email')
        .eq('status_ativo', true)
        .not('email', 'is', null)
        .neq('email', '')
        .not('perfil_rascunho', 'is', true)
        .order('nome');
      if (error) throw error;
      return (data ?? []) as MotoristaAudiencia[];
    },
    enabled,
  });
}
