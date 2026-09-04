import { useEffect, useState } from 'react';
import { format, eachDayOfInterval } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

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
  mes: TotalFaturacao;
  serie: PontoFaturacao[];
}

const VAZIO = (): TotalFaturacao => ({ valor: 0, count: 0 });

/**
 * Faturação tal como a sub-tab Administrativo › Faturação a calcula: sobre
 * `conta_movimentos`, restrita a `origem` cobrança/nota de crédito, com o
 * sinal dado pelo `tipo` (débito soma, crédito subtrai) e a contagem só dos
 * débitos de cobrança — uma nota de crédito baixa o valor mas não é factura.
 *
 * Uma só query cobre os três períodos: o mês contém a semana e o dia.
 */
export function useFaturacaoMovimentos(mesInicio: Date, mesFim: Date, semanaInicio: Date, semanaFim: Date) {
  const [dados, setDados] = useState<FaturacaoMovimentos>({
    hoje: VAZIO(),
    semana: VAZIO(),
    mes: VAZIO(),
    serie: [],
  });
  const [loading, setLoading] = useState(true);

  // Ao dia, e não ao milissegundo — ver a nota em useResumoPlataformas.
  const mesInicioStr = format(mesInicio, 'yyyy-MM-dd');
  const mesFimStr = format(mesFim, 'yyyy-MM-dd');
  const semanaInicioStr = format(semanaInicio, 'yyyy-MM-dd');
  const semanaFimStr = format(semanaFim, 'yyyy-MM-dd');

  useEffect(() => {
    let cancelado = false;
    setLoading(true);
    const hojeStr = format(new Date(), 'yyyy-MM-dd');
    // A semana pode começar no mês anterior; a query tem de cobrir a mais
    // recuada das duas datas.
    const desde = mesInicioStr < semanaInicioStr ? mesInicioStr : semanaInicioStr;
    const ate = mesFimStr > semanaFimStr ? mesFimStr : semanaFimStr;

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
            setDados({ hoje: VAZIO(), semana: VAZIO(), mes: VAZIO(), serie: [] });
            setLoading(false);
            return;
          }

          const totais = { hoje: VAZIO(), semana: VAZIO(), mes: VAZIO() };
          const porDia = new Map<string, { valor: number; contagem: number }>();

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
            if (dia >= mesInicioStr && dia <= mesFimStr) {
              totais.mes.valor += assinado;
              if (eFactura) totais.mes.count += 1;
              const actual = porDia.get(dia) ?? { valor: 0, contagem: 0 };
              actual.valor += assinado;
              if (eFactura) actual.contagem += 1;
              porDia.set(dia, actual);
            }
          }

          // Todos os dias do mês, mesmo os vazios: sem isto o gráfico encolhia
          // o eixo aos dias com movimento e dava a impressão de actividade
          // contínua onde não houve nenhuma.
          const serie = eachDayOfInterval({ start: mesInicio, end: mesFim }).map((d) => {
            const dia = format(d, 'yyyy-MM-dd');
            const v = porDia.get(dia) ?? { valor: 0, contagem: 0 };
            return { dia, label: format(d, 'dd/MM'), valor: v.valor, contagem: v.contagem };
          });

          setDados({ ...totais, serie });
          setLoading(false);
        }
      );

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesInicioStr, mesFimStr, semanaInicioStr, semanaFimStr]);

  return { ...dados, loading };
}
