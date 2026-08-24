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

/**
 * Viaturas que entraram na oficina e ainda não saíram.
 *
 * O critério é `data_entrada` preenchida e `data_saida` vazia — é assim que
 * uma reparação em curso se distingue de uma já fechada.
 *
 * As reparações só existiam dentro da ficha de cada viatura, o que obrigava a
 * abrir carro a carro para saber quem estava parado. Isto serve o bloco "Na
 * oficina" da página de Assistência.
 *
 * NOTA sobre os dados: a 24/08/2026 as 118 reparações registadas tinham todas
 * data de saída, e a mais recente era de 06/08. O bloco aparecerá vazio
 * enquanto ninguém registar a entrada — o que é, em si, informação útil.
 */
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

      // Segunda consulta em vez de join embebido: a relação não está declarada
      // como FK no PostgREST e o embedding falharia em silêncio.
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
