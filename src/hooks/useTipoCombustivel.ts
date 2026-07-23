import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Tipo de combustível da viatura (nome do catálogo, com fallback ao texto
 *  legado) — decide se se mostra o nível de combustível, de bateria, ou ambos
 *  (híbridos). Mesma resolução usada em useViaturas.ts. */
export function useTipoCombustivel(viaturaId: string | null | undefined) {
  return useQuery({
    queryKey: ['viatura-tipo-combustivel', viaturaId],
    enabled: !!viaturaId,
    queryFn: async (): Promise<string | null> => {
      const { data } = await supabase
        .from('viaturas')
        .select('combustivel, combustivel_id')
        .eq('id', viaturaId!)
        .maybeSingle();
      if (!data) return null;
      if (data.combustivel_id) {
        const { data: cat } = await supabase
          .from('viatura_combustiveis')
          .select('nome')
          .eq('id', data.combustivel_id as string)
          .maybeSingle();
        if (cat?.nome) return cat.nome as string;
      }
      return (data.combustivel as string | null) ?? null;
    },
    staleTime: 60_000,
  });
}
