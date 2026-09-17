import { differenceInDays, subDays } from 'date-fns';

export interface DateRangeFixed {
  from: Date;
  to: Date;
}

export interface Variacao {
  pct: number;
  direction: 'up' | 'down' | 'neutral';
  hasPrevious: boolean;
}

export function calcularVariacao(actual: number, previous: number): Variacao {
  if (previous === 0) {
    return {
      pct: 0,
      direction: actual > 0 ? 'up' : 'neutral',
      hasPrevious: false,
    };
  }

  const diff = actual - previous;
  const pct = (diff / Math.abs(previous)) * 100;

  return {
    pct: Math.abs(pct),
    direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral',
    hasPrevious: true,
  };
}

export function calcularPeriodoAnterior(range: DateRangeFixed): DateRangeFixed {
  const durationDays = differenceInDays(range.to, range.from) + 1;
  return {
    from: subDays(range.from, durationDays),
    to: subDays(range.from, 1),
  };
}

export function formatarVariacao(variacao: Variacao): string {
  if (!variacao.hasPrevious) return '';

  const sign = variacao.direction === 'up' ? '+' : variacao.direction === 'down' ? '-' : '';
  const pctStr = variacao.pct.toFixed(1).replace('.', ',');
  return `${sign}${pctStr}%`;
}
