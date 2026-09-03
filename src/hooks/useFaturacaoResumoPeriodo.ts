import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export interface FaturacaoResumoPeriodo {
  pendentes: { count: number; valor: number };
  emitidas: { count: number; valor: number };
  emAtraso: { count: number; valor: number };
}

const VAZIO: FaturacaoResumoPeriodo = {
  pendentes: { count: 0, valor: 0 },
  emitidas: { count: 0, valor: 0 },
  emAtraso: { count: 0, valor: 0 },
};

export function useFaturacaoResumoPeriodo(periodoInicio: Date, periodoFim: Date) {
  const [resumo, setResumo] = useState<FaturacaoResumoPeriodo>(VAZIO);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    const inicioStr = format(periodoInicio, 'yyyy-MM-dd');
    const fimStr = format(periodoFim, 'yyyy-MM-dd');
    const hojeStr = format(new Date(), 'yyyy-MM-dd');

    supabase
      .from('contrato_cobrancas')
      .select('estado, valor_total, periodo_ate')
      // Overlap, nao contencao: uma cobranca (semanal ou mensal nao
      // alinhada com o calendario) que atravesse a fronteira do periodo
      // pedido tem de entrar na soma, senao fica subcontada nos dois
      // periodos que ela toca. Mesmo raciocinio de
      // dashboard_resumo_plataformas (Task 4).
      .lte('periodo_de', fimStr)
      .gte('periodo_ate', inicioStr)
      .neq('estado', 'anulada')
      .then(({ data, error }: { data: any; error: any }) => {
        if (cancelado) return;
        if (error || !data) {
          console.error('Erro ao carregar resumo de faturacao:', error);
          setResumo(VAZIO);
          setLoading(false);
          return;
        }
        const acumulado = data.reduce(
          (acc: FaturacaoResumoPeriodo, row: any) => {
            const valor = Number(row.valor_total) || 0;
            if (row.estado === 'pendente') {
              acc.pendentes.count += 1;
              acc.pendentes.valor += valor;
            } else {
              acc.emitidas.count += 1;
              acc.emitidas.valor += valor;
              if (row.estado === 'emitida' && row.periodo_ate < hojeStr) {
                acc.emAtraso.count += 1;
                acc.emAtraso.valor += valor;
              }
            }
            return acc;
          },
          { pendentes: { count: 0, valor: 0 }, emitidas: { count: 0, valor: 0 }, emAtraso: { count: 0, valor: 0 } }
        );
        setResumo(acumulado);
        setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [periodoInicio.getTime(), periodoFim.getTime()]);

  return { resumo, loading };
}
