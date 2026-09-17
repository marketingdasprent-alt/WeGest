import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';
import { pt } from 'date-fns/locale';

const WEEK_STARTS_ON = 1;

export interface PeriodoCartoes {
  from: Date;
  to: Date;
}

const mes = (d: Date): PeriodoCartoes => ({ from: startOfMonth(d), to: endOfMonth(d) });
const semana = (d: Date): PeriodoCartoes => ({
  from: startOfWeek(d, { weekStartsOn: WEEK_STARTS_ON }),
  to: endOfWeek(d, { weekStartsOn: WEEK_STARTS_ON }),
});

export const periodoPorOmissao = (): PeriodoCartoes => mes(new Date());

export const atalhosPeriodo = (): { label: string; periodo: PeriodoCartoes }[] => {
  const hoje = new Date();
  return [
    { label: 'Este mês', periodo: mes(hoje) },
    { label: 'Mês passado', periodo: mes(subMonths(hoje, 1)) },
    { label: 'Esta semana', periodo: semana(hoje) },
    { label: 'Semana passada', periodo: semana(subWeeks(hoje, 1)) },
    { label: 'Últimos 90 dias', periodo: { from: addDays(hoje, -89), to: hoje } },
  ];
};

const eMesCompleto = (p: PeriodoCartoes) =>
  isSameDay(p.from, startOfMonth(p.from)) && isSameDay(p.to, endOfMonth(p.from));

// Um mês completo anda de mês em mês; qualquer outro intervalo desliza pela
// sua própria duração, para as setas nunca partirem o período escolhido.
export function deslocarPeriodo(p: PeriodoCartoes, direcao: 1 | -1): PeriodoCartoes {
  if (eMesCompleto(p)) return mes(addMonths(p.from, direcao));
  const dias = differenceInCalendarDays(p.to, p.from) + 1;
  return { from: addDays(p.from, direcao * dias), to: addDays(p.to, direcao * dias) };
}

export const periodoIncluiHoje = (p: PeriodoCartoes) => {
  const hoje = new Date();
  return p.from <= hoje && hoje <= addDays(p.to, 1);
};

export function rotuloPeriodo(p: PeriodoCartoes): string {
  const base = `${format(p.from, 'dd/MM', { locale: pt })} - ${format(p.to, 'dd/MM/yyyy', { locale: pt })}`;
  if (eMesCompleto(p) && isSameMonth(p.from, new Date())) return `${base} (Mês atual)`;
  return base;
}

// A RPC filtra com `transaction_date < p_ate`, por isso o fim é exclusivo.
export const limitesRpc = (p: PeriodoCartoes) => ({
  desde: startOfDayISO(p.from),
  ate: startOfDayISO(addDays(p.to, 1)),
});

function startOfDayISO(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}
