import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GestorTvde {
  id: string;
  nome: string;
  email: string | null;
}

/**
 * Colaboradores do cargo "Gestor TVDE" da org actual (profiles, filtrados por
 * RLS). Usado no seletor de gestor responsável de contratos/reservas e nos
 * filtros das listas. Guarda o `id` (profiles.id = auth.uid), apresenta nome/email.
 */
export function useGestoresTvde() {
  return useQuery({
    queryKey: ['gestores-tvde'],
    queryFn: async (): Promise<GestorTvde[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome, email')
        .not('nome', 'is', null)
        .ilike('cargo', '%Gestor%TVDE%')
        .order('nome');
      if (error) throw error;
      return (data ?? []).map((p) => ({
        id: p.id as string,
        nome: (p.nome as string) ?? '',
        email: (p.email as string | null) ?? null,
      }));
    },
    staleTime: 60_000,
  });
}
