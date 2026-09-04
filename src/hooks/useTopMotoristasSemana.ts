import { useEffect, useState } from 'react';
import { startOfWeek, endOfWeek, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export interface MotoristaSemanaResumo {
  motoristaId: string;
  nome: string;
  faturado: number;
  liquido: number;
}

/** Faturado/líquido por motorista na semana actual (Bolt+Uber) — sem aluguer nem custos. */
export function useTopMotoristasSemana(limite = 5) {
  const [motoristas, setMotoristas] = useState<MotoristaSemanaResumo[]>([]);
  const [periodo] = useState(() => ({
    inicio: startOfWeek(new Date(), { weekStartsOn: 1 }),
    fim: endOfWeek(new Date(), { weekStartsOn: 1 }),
  }));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    const inicioStr = format(periodo.inicio, 'yyyy-MM-dd');
    const fimStr = format(periodo.fim, 'yyyy-MM-dd');

    async function carregar() {
      const [boltRes, uberRes] = await Promise.all([
        supabase
          .from('bolt_resumos_semanais')
          .select('motorista_id, ganhos_brutos_total, ganhos_liquidos')
          .eq('periodo_inicio', inicioStr)
          .eq('periodo_fim', fimStr),
        supabase
          .from('uber_resumos_semanais')
          .select('motorista_id, ganhos_brutos, ganhos_liquidos')
          .eq('periodo_inicio', inicioStr)
          .eq('periodo_fim', fimStr),
      ]);
      if (cancelado) return;

      const porMotorista = new Map<string, { faturado: number; liquido: number }>();
      const acumular = (motoristaId: string | null | undefined, bruto: number, liquido: number) => {
        if (!motoristaId) return;
        const actual = porMotorista.get(motoristaId) ?? { faturado: 0, liquido: 0 };
        actual.faturado += bruto;
        actual.liquido += liquido;
        porMotorista.set(motoristaId, actual);
      };

      (boltRes.data ?? []).forEach((r) =>
        acumular(r.motorista_id, Number(r.ganhos_brutos_total) || 0, Number(r.ganhos_liquidos) || 0)
      );
      (uberRes.data ?? []).forEach((r) =>
        acumular(r.motorista_id, Number(r.ganhos_brutos) || 0, Number(r.ganhos_liquidos) || 0)
      );

      const ids = [...porMotorista.keys()];
      let nomes: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: motoristasData } = await supabase
          .from('motoristas_ativos')
          .select('id, nome')
          .in('id', ids);
        nomes = Object.fromEntries((motoristasData ?? []).map((m) => [m.id, m.nome]));
      }
      if (cancelado) return;

      const lista = [...porMotorista.entries()]
        .map(([motoristaId, v]) => ({
          motoristaId,
          nome: nomes[motoristaId] ?? 'Motorista',
          faturado: v.faturado,
          liquido: v.liquido,
        }))
        .sort((a, b) => b.faturado - a.faturado)
        .slice(0, limite);

      setMotoristas(lista);
      setLoading(false);
    }

    carregar();
    return () => {
      cancelado = true;
    };
  }, [limite, periodo.inicio, periodo.fim]);

  return { motoristas, periodo, loading };
}
