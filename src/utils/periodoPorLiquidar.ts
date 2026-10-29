import { format, startOfMonth, subDays, subMonths, endOfMonth } from 'date-fns';

export type PeriodoAtalho = 'este-mes' | 'mes-passado' | '90-dias' | 'tudo';
export type Periodo = PeriodoAtalho | 'personalizado';

export const PERIODO_LABEL: Record<Periodo, string> = {
  'este-mes': 'Este mês',
  'mes-passado': 'Mês passado',
  '90-dias': 'Últimos 90 dias',
  tudo: 'Desde sempre',
  personalizado: 'Personalizado',
};

const iso = (d: Date) => format(d, 'yyyy-MM-dd');

/** Datas de um atalho; "tudo" deixa as duas vazias (sem limite). */
export function datasDoPeriodo(
  p: PeriodoAtalho,
  hoje: Date = new Date()
): { de: string; ate: string } {
  switch (p) {
    case 'este-mes':
      return { de: iso(startOfMonth(hoje)), ate: iso(hoje) };
    case 'mes-passado': {
      const anterior = subMonths(hoje, 1);
      return { de: iso(startOfMonth(anterior)), ate: iso(endOfMonth(anterior)) };
    }
    case '90-dias':
      return { de: iso(subDays(hoje, 90)), ate: iso(hoje) };
    case 'tudo':
      return { de: '', ate: '' };
  }
}

/** Que atalho corresponde às datas escolhidas; datas à mão dão "personalizado". */
export function periodoDasDatas(de: string, ate: string, hoje: Date = new Date()): Periodo {
  const atalhos: PeriodoAtalho[] = ['este-mes', 'mes-passado', '90-dias', 'tudo'];
  return (
    atalhos.find((p) => {
      const d = datasDoPeriodo(p, hoje);
      return d.de === de && d.ate === ate;
    }) ?? 'personalizado'
  );
}
