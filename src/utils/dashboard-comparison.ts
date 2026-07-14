import { differenceInDays, subDays } from 'date-fns';

/**
 * Intervalo de datas com `from` e `to` garantidos (não-undefined).
 * Usado internamente pelos helpers de comparação — o Dashboard converte
 * o `DateRange` do `useDateRange` (que pode ter `undefined`) antes de chamar.
 */
export interface DateRangeFixed {
  from: Date;
  to: Date;
}

/**
 * Resultado do cálculo de variação entre dois períodos.
 */
export interface Variacao {
  /** Percentagem absoluta da variação (sempre >= 0). */
  pct: number;
  /** Direção da variação. */
  direction: 'up' | 'down' | 'neutral';
  /** `false` quando o período anterior não tem dados (previous === 0). */
  hasPrevious: boolean;
}

/**
 * Calcula a variação percentual entre um valor actual e um valor anterior.
 *
 * - Se `previous` for 0, retorna `hasPrevious: false` (não há base de comparação).
 * - Se `actual === previous`, retorna `direction: 'neutral'`.
 * - A percentagem é sempre absoluta (>= 0); a direcção indica se subiu ou desceu.
 *
 * @example
 * ```ts
 * calcularVariacao(120, 100); // { pct: 20, direction: 'up', hasPrevious: true }
 * calcularVariacao(80, 100);  // { pct: 20, direction: 'down', hasPrevious: true }
 * calcularVariacao(50, 0);    // { pct: 0, direction: 'up', hasPrevious: false }
 * ```
 */
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

/**
 * Calcula o período anterior de mesma duração, imediatamente antes do intervalo dado.
 *
 * Duração = nº de dias entre `from` e `to` (inclusivo).
 * Período anterior = [from - duração, from - 1 dia].
 *
 * @example
 * ```ts
 * // from = 1 Jan, to = 31 Jan → duração = 31 dias
 * // período anterior = 1 Dez a 31 Dez
 * calcularPeriodoAnterior({ from: new Date('2025-01-01'), to: new Date('2025-01-31') });
 * ```
 */
export function calcularPeriodoAnterior(range: DateRangeFixed): DateRangeFixed {
  const durationDays = differenceInDays(range.to, range.from) + 1; // inclusivo
  return {
    from: subDays(range.from, durationDays),
    to: subDays(range.from, 1),
  };
}

/**
 * Formata uma variação como string de exibição (ex: "+12,5%" ou "-8,3%").
 *
 * Usa vírgula como separador decimal (pt-PT).
 * Retorna string vazia quando `hasPrevious` é `false`.
 */
export function formatarVariacao(variacao: Variacao): string {
  if (!variacao.hasPrevious) return '';

  const sign = variacao.direction === 'up' ? '+' : variacao.direction === 'down' ? '-' : '';
  const pctStr = variacao.pct.toFixed(1).replace('.', ',');
  return `${sign}${pctStr}%`;
}
