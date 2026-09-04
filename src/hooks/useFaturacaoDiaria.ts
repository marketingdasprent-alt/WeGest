import { useEffect, useState } from 'react';
import { format, eachDayOfInterval } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

export interface PontoFaturacao {
  /** 'yyyy-MM-dd' — chave do dia. */
  dia: string;
  /** Rótulo curto para o eixo ('28/08'). */
  label: string;
  valor: number;
  contagem: number;
}

/**
 * Faturação emitida por dia, para o gráfico do dashboard Financeiro.
 *
 * Conta pela data de emissão (`emitida_em`) e não pelo período coberto: o
 * gráfico responde a "quanto foi facturado em cada dia", que é o momento em
 * que o documento saiu. Cobranças ainda pendentes não têm `emitida_em` e
 * ficam de fora — aparecem no KPI "Por emitir", não aqui.
 */
export function useFaturacaoDiaria(periodoInicio: Date, periodoFim: Date) {
  const [pontos, setPontos] = useState<PontoFaturacao[]>([]);
  const [total, setTotal] = useState(0);
  const [totalDocumentos, setTotalDocumentos] = useState(0);
  const [loading, setLoading] = useState(true);

  // Ao dia, e não ao milissegundo — ver a nota em useResumoPlataformas.
  const inicioStr = format(periodoInicio, 'yyyy-MM-dd');
  const fimStr = format(periodoFim, 'yyyy-MM-dd');

  useEffect(() => {
    let cancelado = false;
    setLoading(true);

    supabase
      .from('contrato_cobrancas')
      .select('valor_total, emitida_em')
      .not('emitida_em', 'is', null)
      .gte('emitida_em', `${inicioStr}T00:00:00`)
      .lte('emitida_em', `${fimStr}T23:59:59`)
      .neq('estado', 'anulada')
      .then(({ data, error }: { data: { valor_total: number; emitida_em: string }[] | null; error: unknown }) => {
        if (cancelado) return;

        const porDia = new Map<string, { valor: number; contagem: number }>();
        if (!error && data) {
          for (const row of data) {
            const dia = row.emitida_em.slice(0, 10);
            const actual = porDia.get(dia) ?? { valor: 0, contagem: 0 };
            actual.valor += Number(row.valor_total) || 0;
            actual.contagem += 1;
            porDia.set(dia, actual);
          }
        } else if (error) {
          console.error('Erro ao carregar faturação diária:', error);
        }

        // Todos os dias do período, mesmo os vazios: sem isto o gráfico
        // encolhia o eixo aos dias com documentos e dava a impressão de
        // actividade contínua onde não houve nenhuma.
        const dias = eachDayOfInterval({ start: periodoInicio, end: periodoFim });
        const serie = dias.map((d) => {
          const dia = format(d, 'yyyy-MM-dd');
          const v = porDia.get(dia) ?? { valor: 0, contagem: 0 };
          return { dia, label: format(d, 'dd/MM'), valor: v.valor, contagem: v.contagem };
        });

        setPontos(serie);
        setTotal(serie.reduce((s, p) => s + p.valor, 0));
        setTotalDocumentos(serie.reduce((s, p) => s + p.contagem, 0));
        setLoading(false);
      });

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicioStr, fimStr]);

  return { pontos, total, totalDocumentos, loading };
}
