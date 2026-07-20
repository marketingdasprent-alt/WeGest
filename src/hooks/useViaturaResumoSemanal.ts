import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ViaturaResumoSemanal {
  id: string;
  semanaInicio: string;
  semanaFim: string;
  receitaAluguer: number;
  receitaOutros: number;
  despesaCombustivel: number;
  despesaPortagens: number;
  despesaDanos: number;
  despesaOutros: number;
  receitaTotal: number;
  despesaTotal: number;
  saldo: number;
}

export function useViaturaResumoSemanal(viaturaId: string | undefined) {
  const [semanas, setSemanas] = useState<ViaturaResumoSemanal[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!viaturaId) {
      setSemanas([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from('viatura_resumo_semanal')
      .select(
        'id, semana_inicio, semana_fim, receita_aluguer, receita_outros, despesa_combustivel, despesa_portagens, despesa_danos, despesa_outros'
      )
      .eq('viatura_id', viaturaId)
      .order('semana_inicio', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        const mapped = (data ?? []).map((r) => {
          const receitaAluguer = Number(r.receita_aluguer) || 0;
          const receitaOutros = Number(r.receita_outros) || 0;
          const despesaCombustivel = Number(r.despesa_combustivel) || 0;
          const despesaPortagens = Number(r.despesa_portagens) || 0;
          const despesaDanos = Number(r.despesa_danos) || 0;
          const despesaOutros = Number(r.despesa_outros) || 0;
          const receitaTotal = receitaAluguer + receitaOutros;
          const despesaTotal = despesaCombustivel + despesaPortagens + despesaDanos + despesaOutros;
          return {
            id: r.id as string,
            semanaInicio: r.semana_inicio as string,
            semanaFim: r.semana_fim as string,
            receitaAluguer,
            receitaOutros,
            despesaCombustivel,
            despesaPortagens,
            despesaDanos,
            despesaOutros,
            receitaTotal,
            despesaTotal,
            saldo: receitaTotal - despesaTotal,
          };
        });
        setSemanas(mapped);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [viaturaId]);

  return { semanas, loading };
}
