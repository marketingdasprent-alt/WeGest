// Cálculo do gráfico "Atividade" da dashboard de frota — separado do
// componente para caber no limite de 500 linhas e, sobretudo, porque é lógica
// pura: recebe eventos e um intervalo, devolve pontos. Testa-se sem montar a
// página.
import {
  format,
  endOfMonth,
  differenceInCalendarDays,
  eachMonthOfInterval,
  eachWeekOfInterval,
  eachDayOfInterval,
} from 'date-fns';
import { pt } from 'date-fns/locale';
import type { DateRange } from '@/components/dashboard/periodo';
import type { ChartPoint } from '@/components/dashboard/ReceitaChart';

export interface EventoAtividade {
  tipo: string;
  data_inicio: string;
  valor_aluguer: number;
}

export type Granularidade = 'dia' | 'semana' | 'mes';

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);
}

export function normalizarMatricula(m: string | null | undefined): string {
  return (m ?? '').replace(/[-\s]/g, '').toUpperCase();
}

/** A granularidade não é escolha do utilizador — se fosse, teríamos dois
 *  controlos de tempo lado a lado a dizer "Semana" e a parecerem o mesmo. Sai
 *  do tamanho do intervalo, procurando ~5 a 15 barras: um ano ao dia dava 365
 *  barras ilegíveis, uma semana ao mês dava uma só. */
export function granularidadePara({ from, to }: DateRange): Granularidade {
  const dias = differenceInCalendarDays(to, from) + 1;
  if (dias <= 14) return 'dia';
  if (dias <= 92) return 'semana';
  return 'mes';
}

/** Constrói os pontos do gráfico de atividade a partir dos eventos já
 *  carregados (não faz novas queries) — o intervalo vem do seletor de período
 *  e os eventos já foram buscados para esse mesmo intervalo. */
export function buildChartPoints(
  eventos: EventoAtividade[],
  inicio: Date,
  fim: Date,
  granularidade: Granularidade
): ChartPoint[] {
  const calcBucket = (
    bucketStart: Date,
    bucketEnd: Date,
    label: string,
    periodo: string
  ): ChartPoint => {
    const bStartStr = bucketStart.toISOString().split('T')[0];
    const bEndStr = bucketEnd.toISOString().split('T')[0];

    const eventosBucket = eventos.filter((ev) => {
      const evDate = ev.data_inicio.split('T')[0];
      return evDate >= bStartStr && evDate <= bEndStr;
    });
    const entregasBucket = eventosBucket.filter((ev) => ev.tipo === 'entrega');
    const alugados = entregasBucket.length;
    const devolvidos = eventosBucket.filter(
      (ev) => ev.tipo === 'devolucao' || ev.tipo === 'recolha'
    ).length;
    const receitaContratada = entregasBucket.reduce((sum, ev) => sum + ev.valor_aluguer, 0);

    return { periodo, label, receitaContratada, alugados, devolvidos };
  };

  if (granularidade === 'dia') {
    const dias = eachDayOfInterval({ start: inicio, end: fim });
    return dias.map((dia) =>
      calcBucket(dia, dia, format(dia, 'dd MMM', { locale: pt }), format(dia, 'dd/MM'))
    );
  }

  if (granularidade === 'mes') {
    const meses = eachMonthOfInterval({ start: inicio, end: fim });
    return meses.map((mesInicio, i) => {
      // O último balde fecha em `fim` (o mês em curso está incompleto), os
      // restantes no fim do próprio mês.
      const mesFim = i + 1 < meses.length ? endOfMonth(mesInicio) : fim;
      return calcBucket(
        mesInicio,
        mesFim,
        format(mesInicio, 'MMMM yyyy', { locale: pt }),
        format(mesInicio, 'MMM yy', { locale: pt })
      );
    });
  }

  const semanas = eachWeekOfInterval({ start: inicio, end: fim }, { weekStartsOn: 1 });
  return semanas.map((semanaInicio, i) => {
    const semanaFim = i + 1 < semanas.length ? new Date(semanas[i + 1].getTime() - 1) : fim;
    return calcBucket(
      semanaInicio,
      semanaFim,
      `Semana ${format(semanaInicio, 'dd MMM', { locale: pt })}`,
      format(semanaInicio, 'dd/MM', { locale: pt })
    );
  });
}
