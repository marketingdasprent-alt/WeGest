import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface MotoristaResumoSemanal {
  semanaInicio: string;
  semanaFim: string;
  custoAluguer: number;
  receitaBolt: number;
  receitaUber: number;
  receitaOutras: number;
  despesaCaucao: number;
  despesaSeguros: number;
  despesaOutros: number;
  receitaTotal: number;
  despesaTotal: number;
  saldo: number;
}

export function useMotoristaResumoSemanal(motoristaId: string | undefined) {
  const [semanas, setSemanas] = useState<MotoristaResumoSemanal[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!motoristaId) {
      setSemanas([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from('motorista_resumo_semanal')
      .select(
        'semana_inicio, semana_fim, custo_aluguer, receita_bolt, receita_uber, receita_outras, despesa_caucao, despesa_seguros, despesa_outros'
      )
      .eq('motorista_id', motoristaId)
      .order('semana_inicio', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;

        const porSemana = new Map<string, MotoristaResumoSemanal>();
        for (const r of data ?? []) {
          const key = r.semana_inicio as string;
          const atual = porSemana.get(key) ?? {
            semanaInicio: r.semana_inicio as string,
            semanaFim: r.semana_fim as string,
            custoAluguer: 0,
            receitaBolt: 0,
            receitaUber: 0,
            receitaOutras: 0,
            despesaCaucao: 0,
            despesaSeguros: 0,
            despesaOutros: 0,
            receitaTotal: 0,
            despesaTotal: 0,
            saldo: 0,
          };
          atual.custoAluguer += Number(r.custo_aluguer) || 0;
          atual.receitaBolt += Number(r.receita_bolt) || 0;
          atual.receitaUber += Number(r.receita_uber) || 0;
          atual.receitaOutras += Number(r.receita_outras) || 0;
          atual.despesaCaucao += Number(r.despesa_caucao) || 0;
          atual.despesaSeguros += Number(r.despesa_seguros) || 0;
          atual.despesaOutros += Number(r.despesa_outros) || 0;
          porSemana.set(key, atual);
        }

        const semanasAgregadas = Array.from(porSemana.values()).map((s) => {
          const receitaTotal = s.receitaBolt + s.receitaUber + s.receitaOutras;
          const despesaTotal =
            s.custoAluguer + s.despesaCaucao + s.despesaSeguros + s.despesaOutros;
          return { ...s, receitaTotal, despesaTotal, saldo: receitaTotal - despesaTotal };
        });

        setSemanas(semanasAgregadas);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [motoristaId]);

  return { semanas, loading };
}
