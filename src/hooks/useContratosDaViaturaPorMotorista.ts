import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';

export interface ContratoResumoLink {
  id: string;
  codigo: number | null;
}

/**
 * Contratos desta viatura, agrupados pelo motorista que os conduziu.
 *
 * Serve o histórico da viatura, que lista vínculos de `motorista_viaturas` —
 * tabela que não tem ligação nenhuma a contratos. Sem isto não havia como
 * mostrar o número do contrato nem abri-lo, e era preciso ir procurá-lo à mão
 * na lista de contratos.
 *
 * A ligação é viatura + motorista (via contrato_condutores), SEM filtro de
 * datas. Filtrar por sobreposição de períodos parecia mais correcto, mas
 * testado contra produção não desambigua nada e arriscava esconder contratos
 * — que é exactamente a queixa que isto veio resolver. As datas dos contratos
 * são pouco fiáveis (ver as cadeias de troca), por isso mostra-se tudo o que
 * liga aquele motorista àquela viatura e deixa-se a leitura a quem sabe.
 *
 * Um motorista pode ter mais do que um contrato na mesma viatura (renovações,
 * regressos) — daí devolver lista e não um só.
 */
export function useContratosDaViaturaPorMotorista(viaturaId?: string | null) {
  return useQuery({
    queryKey: ['viatura-contratos-por-motorista', viaturaId],
    enabled: !!viaturaId,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, ContratoResumoLink[]>> => {
      const { data, error } = await supabase
        .from('contratos_renting')
        .select('id, codigo, data_inicio, contrato_condutores(motorista_id)')
        .eq('viatura_id', viaturaId!)
        .is('deleted_at', null)
        .order('data_inicio', { ascending: false });
      if (error) throw error;

      const porMotorista = new Map<string, ContratoResumoLink[]>();
      for (const c of data ?? []) {
        const contrato: ContratoResumoLink = { id: c.id, codigo: c.codigo };
        const condutores = (c.contrato_condutores ?? []) as { motorista_id: string | null }[];
        for (const cond of condutores) {
          if (!cond.motorista_id) continue;
          const lista = porMotorista.get(cond.motorista_id) ?? [];
          // Um condutor pode aparecer duas vezes no mesmo contrato (períodos
          // distintos em contrato_condutores) — o link seria o mesmo.
          if (!lista.some((x) => x.id === contrato.id)) lista.push(contrato);
          porMotorista.set(cond.motorista_id, lista);
        }
      }
      return porMotorista;
    },
  });
}
