import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';

export interface ViaturaNaOficina {
  id: string;
  viatura_id: string;
  matricula: string | null;
  marca: string | null;
  modelo: string | null;
  descricao: string | null;
  oficina: string | null;
  data_entrada: string;
  km_entrada: number | null;
}

export function useViaturasNaOficina() {
  return useQuery({
    queryKey: ['viaturas-na-oficina'],
    staleTime: 60_000,
    queryFn: async (): Promise<ViaturaNaOficina[]> => {
      const { data, error } = await supabase
        .from('viatura_reparacoes')
        .select('id, viatura_id, descricao, oficina, data_entrada, km_entrada')
        .not('data_entrada', 'is', null)
        .is('data_saida', null)
        .order('data_entrada', { ascending: true });
      if (error) throw error;

      const linhas = data ?? [];
      if (linhas.length === 0) return [];

      // Não há FK no PostgREST para um embed seguro desta relação.
      const ids = [...new Set(linhas.map((r) => r.viatura_id).filter(Boolean))] as string[];
      const { data: viaturas, error: errV } = await supabase
        .from('viaturas')
        .select('id, matricula, marca, modelo')
        .in('id', ids);
      if (errV) throw errV;

      const porId = new Map((viaturas ?? []).map((v) => [v.id, v]));
      return linhas.map((r) => {
        const v = porId.get(r.viatura_id);
        return {
          id: r.id,
          viatura_id: r.viatura_id,
          matricula: v?.matricula ?? null,
          marca: v?.marca ?? null,
          modelo: v?.modelo ?? null,
          descricao: r.descricao,
          oficina: r.oficina,
          data_entrada: r.data_entrada as string,
          km_entrada: r.km_entrada,
        };
      });
    },
  });
}
