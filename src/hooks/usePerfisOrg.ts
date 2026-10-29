import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PerfilOrg {
  id: string;
  nome: string;
}

// Tecto espelhado na função SQL: acima disto perfis_org devolve 0 linhas.
export const MAX_IDS_POR_PEDIDO = 500;

function dedupe(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => Boolean(id)))];
}

/**
 * Nome dos colegas da organização activa (criado por, atribuído a). Passa por
 * perfis_org porque a RLS de profiles só deixa ler colegas a quem tem
 * calendario_ver_gestores — um mecânico via "Desconhecido" em todos os tickets.
 */
export async function fetchPerfisOrg(ids: readonly string[]): Promise<PerfilOrg[]> {
  const unicos = dedupe(ids);
  if (unicos.length === 0) return [];

  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += MAX_IDS_POR_PEDIDO) {
    lotes.push(unicos.slice(i, i + MAX_IDS_POR_PEDIDO));
  }

  const resultados = await Promise.all(
    lotes.map(async (lote) => {
      const { data, error } = await supabase.rpc('perfis_org', { p_ids: lote });
      if (error) throw error;
      return data ?? [];
    })
  );
  return resultados.flat();
}

interface UsePerfisOrgOptions {
  enabled?: boolean;
}

export function usePerfisOrg(ids: readonly string[], options: UsePerfisOrgOptions = {}) {
  const { enabled = true } = options;
  // Ordenado para a queryKey não mudar com a ordem em que os ids chegam.
  const unicos = dedupe(ids).sort();

  return useQuery({
    queryKey: ['perfis-org', unicos],
    queryFn: () => fetchPerfisOrg(unicos),
    enabled: enabled && unicos.length > 0,
    staleTime: 60_000,
  });
}
