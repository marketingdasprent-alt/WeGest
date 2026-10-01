import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';

export interface ContratoResumoLink {
  id: string;
  codigo: number | null;
}

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

          if (!lista.some((x) => x.id === contrato.id)) lista.push(contrato);
          porMotorista.set(cond.motorista_id, lista);
        }
      }
      return porMotorista;
    },
  });
}
