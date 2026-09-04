import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

/** Soma das cobranças semanais TVDE (aluguer da viatura) que tocam o período pedido. */
export function useAluguerResumoPeriodo(periodoInicio: Date, periodoFim: Date) {
  const [valor, setValor] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    const inicioStr = format(periodoInicio, 'yyyy-MM-dd');
    const fimStr = format(periodoFim, 'yyyy-MM-dd');

    supabase
      .from('contrato_cobrancas')
      .select('valor_total')
      .eq('tipo_cobranca', 'tvde_semanal')
      .neq('estado', 'anulada')
      // Overlap, não contenção — mesmo raciocínio de useFaturacaoResumoPeriodo e
      // dashboard_resumo_plataformas: uma cobrança semanal que atravesse a
      // fronteira do período pedido tem de entrar na soma.
      .lte('periodo_de', fimStr)
      .gte('periodo_ate', inicioStr)
      .then(({ data, error }: { data: { valor_total: number }[] | null; error: unknown }) => {
        if (cancelado) return;
        if (error || !data) {
          setValor(0);
        } else {
          setValor(data.reduce((s, r) => s + (Number(r.valor_total) || 0), 0));
        }
        setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [periodoInicio.getTime(), periodoFim.getTime()]);

  return { valor, loading };
}
