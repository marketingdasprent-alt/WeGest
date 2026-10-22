import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { FILTRO_NAO_VENDIDA } from '@/lib/viaturas';

export interface ViaturaSubstituta {
  id: string;
  matricula: string;
  marca: string;
  modelo: string;
  status: string;
  km_atual: number | null;
}

interface UseViaturasSubstitutasOptions {
  /** A viatura que entra em assistência nunca é substituta de si própria. */
  excluirViaturaId?: string | null;
  enabled?: boolean;
}

/** Viaturas que podem servir de substituta: disponíveis, sem ser slot nem vendidas. */
export function useViaturasSubstitutas(options: UseViaturasSubstitutasOptions = {}) {
  const { excluirViaturaId = null, enabled = true } = options;

  return useQuery({
    queryKey: ['viaturas', 'substitutas', { excluirViaturaId }],
    queryFn: async () => {
      let q = supabase
        .from('viaturas')
        .select('id, matricula, marca, modelo, status, km_atual')
        .eq('status', 'disponivel')
        // Booleanos nullable: NULL conta como "não". Vários .or() combinam-se com AND.
        .or('is_slot.is.null,is_slot.eq.false')
        .or(FILTRO_NAO_VENDIDA);
      if (excluirViaturaId) q = q.neq('id', excluirViaturaId);

      const { data, error } = await q.order('matricula');
      if (error) throw error;
      return (data ?? []).map(
        (v): ViaturaSubstituta => ({ ...v, status: v.status ?? 'disponivel' })
      );
    },
    enabled,
  });
}
