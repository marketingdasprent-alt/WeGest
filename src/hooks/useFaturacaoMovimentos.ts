import { useEffect, useState } from 'react';
import { format, differenceInCalendarDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import {
  baldesDoIntervalo,
  chaveDoBalde,
  type Granularidade,
} from '@/components/dashboard/periodo';

export interface TotalFaturacao {
  valor: number;
  /** Nº de facturas (débitos de cobrança) — notas de crédito não contam. */
  count: number;
}

export interface PontoFaturacao {
  dia: string;
  label: string;
  valor: number;
  contagem: number;
}

export interface FaturacaoMovimentos {
  hoje: TotalFaturacao;
  semana: TotalFaturacao;
  /** Total do período escolhido no seletor do gráfico. */
  periodo: TotalFaturacao;
  serie: PontoFaturacao[];
}

const VAZIO = (): TotalFaturacao => ({ valor: 0, count: 0 });

/**
 * Quantas barras cabem é uma propriedade DESTE gráfico, por isso a regra vive
 * aqui e não em `periodo.ts`: um mês ao dia (31 barras) é exactamente a vista
 * útil da faturação — saber em que dias se emitiu — enquanto o gráfico de
 * atividade da frota, mais largo por barra, já agrupa à semana nesse tamanho.
 */
function granularidadePara(inicio: Date, fim: Date): Granularidade {
  const dias = differenceInCalendarDays(fim, inicio) + 1;
  if (dias <= 62) return 'dia'; // até dois meses: uma barra por dia
  if (dias <= 186) return 'semana'; // até meio ano: ~27 barras
  return 'mes'; // um ano dá 12 — à semana dava 53, ilegíveis
}

/**
 * Faturação tal como a sub-tab Administrativo › Faturação a calcula: sobre
 * `conta_movimentos`, restrita a `origem` cobrança/nota de crédito, com o
 * sinal dado pelo `tipo` (débito soma, crédito subtrai) e a contagem só dos
 * débitos de cobrança — uma nota de crédito baixa o valor mas não é factura.
 *
 * Uma só query cobre os três recortes: o período do gráfico, a semana e o dia.
 */
export function useFaturacaoMovimentos(
  periodoInicio: Date,
  periodoFim: Date,
  semanaInicio: Date,
  semanaFim: Date
) {
  const [dados, setDados] = useState<FaturacaoMovimentos>({
    hoje: VAZIO(),
    semana: VAZIO(),
    periodo: VAZIO(),
    serie: [],
  });
  const [loading, setLoading] = useState(true);

  // Ao dia, e não ao milissegundo — ver a nota em useResumoPlataformas.
  const periodoInicioStr = format(periodoInicio, 'yyyy-MM-dd');
  const periodoFimStr = format(periodoFim, 'yyyy-MM-dd');
  const semanaInicioStr = format(semanaInicio, 'yyyy-MM-dd');
  const semanaFimStr = format(semanaFim, 'yyyy-MM-dd');

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    const hojeStr = format(new Date(), 'yyyy-MM-dd');
    // A semana pode cair fora do período escolhido; a query tem de cobrir a
    // união dos dois.
    const desde = periodoInicioStr < semanaInicioStr ? periodoInicioStr : semanaInicioStr;
    const ate = periodoFimStr > semanaFimStr ? periodoFimStr : semanaFimStr;

    supabase
      .from('conta_movimentos')
      .select('valor, tipo, origem, data_movimento')
      .in('origem', ['cobranca', 'nota_credito'])
      .gte('data_movimento', desde)
      .lte('data_movimento', ate)
      .then(
        ({
          data,
          error,
        }: {
          data: { valor: number; tipo: string; origem: string; data_movimento: string }[] | null;
          error: unknown;
        }) => {
          if (cancelado) return;
          if (error || !data) {
            console.error('Erro ao carregar faturação:', error);
            setDados({ hoje: VAZIO(), semana: VAZIO(), periodo: VAZIO(), serie: [] });
            setLoading(false);
            return;
          }

          const granularidade = granularidadePara(periodoInicio, periodoFim);
          const totais = { hoje: VAZIO(), semana: VAZIO(), periodo: VAZIO() };
          const serie: PontoFaturacao[] = baldesDoIntervalo(
            periodoInicio,
            periodoFim,
            granularidade
          ).map((b) => ({ dia: b.chave, label: b.label, valor: 0, contagem: 0 }));
          const porBalde = new Map(serie.map((p) => [p.dia, p]));

          for (const m of data) {
            const dia = m.data_movimento;
            if (!dia) continue;
            const v = Number(m.valor) || 0;
            const assinado = m.tipo === 'debito' ? v : -v;
            const eFactura = m.tipo === 'debito' && m.origem === 'cobranca';

            if (dia === hojeStr) {
              totais.hoje.valor += assinado;
              if (eFactura) totais.hoje.count += 1;
            }
            if (dia >= semanaInicioStr && dia <= semanaFimStr) {
              totais.semana.valor += assinado;
              if (eFactura) totais.semana.count += 1;
            }
            if (dia >= periodoInicioStr && dia <= periodoFimStr) {
              totais.periodo.valor += assinado;
              if (eFactura) totais.periodo.count += 1;
              const balde = porBalde.get(chaveDoBalde(new Date(`${dia}T00:00:00`), granularidade));
              if (balde) {
                balde.valor += assinado;
                if (eFactura) balde.contagem += 1;
              }
            }
          }

          setDados({ ...totais, serie });
          setLoading(false);
        }
      );

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoInicioStr, periodoFimStr, semanaInicioStr, semanaFimStr]);

  return { ...dados, loading };
}
