/**
 * Lógica pura da faturação mensal de slot (regime em que o motorista usa carro
 * próprio sob a licença TVDE). Fonte de verdade do algoritmo de datas/proração;
 * as funções SQL (trigger de entrada + cron mensal) traduzem fielmente isto.
 *
 * Regra (V = valor mensal BRUTO, entrada no mês M dia D):
 *  - Entrada → V cheio, período = mês M+1 inteiro.
 *  - 1ª semana de M+1 → stub = round(V × dias/dias_do_mês, 2), período D..fim de M
 *    (dias inclui o dia de entrada).
 *  - 1ª semana de M+2, M+3… → V cheio do mês.
 */
import {
  startOfMonth,
  endOfMonth,
  addMonths,
  getDaysInMonth,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  format,
} from 'date-fns';

export const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

const iso = (date: Date): string => format(date, 'yyyy-MM-dd');

export interface PeriodoCobranca {
  de: string;
  ate: string;
}

/** Mês de calendário completo a seguir à entrada (M+1). */
export function periodoMesSeguinte(entrada: Date): PeriodoCobranca {
  const mesSeguinte = addMonths(startOfMonth(entrada), 1);
  return { de: iso(startOfMonth(mesSeguinte)), ate: iso(endOfMonth(mesSeguinte)) };
}

/** Parcela do mês de entrada: do dia de entrada ao fim do mês (inclui a entrada). */
export function periodoStubEntrada(entrada: Date): {
  periodo: PeriodoCobranca;
  dias: number;
  diasDoMes: number;
} {
  const fim = endOfMonth(entrada);
  const dias = differenceInCalendarDays(fim, entrada) + 1;
  return {
    periodo: { de: iso(entrada), ate: iso(fim) },
    dias,
    diasDoMes: getDaysInMonth(entrada),
  };
}

/** Mês de calendário inteiro de `ref`. */
export function periodoMes(ref: Date): PeriodoCobranca {
  return { de: iso(startOfMonth(ref)), ate: iso(endOfMonth(ref)) };
}

/** Valor bruto da parcela do mês de entrada. */
export function valorStub(valorMensalBruto: number, entrada: Date): number {
  const { dias, diasDoMes } = periodoStubEntrada(entrada);
  return round2((valorMensalBruto * dias) / diasDoMes);
}

export type TipoSlotMensal = 'stub' | 'mensal' | 'nenhum';

/**
 * O que cobrar no mês `ref` para um slot que entrou em `entrada`:
 *  - ref === mês de entrada (M)        → nenhum
 *  - ref === M+1                        → stub (parcela de M)
 *  - ref >= M+2                         → mensal cheio (de ref)
 */
export function cobrancaMensalDoMes(
  entrada: Date,
  ref: Date,
  valorMensalBruto: number
): { tipo: TipoSlotMensal; periodo: PeriodoCobranca | null; valor: number } {
  const meses = differenceInCalendarMonths(startOfMonth(ref), startOfMonth(entrada));
  if (meses === 1) {
    return {
      tipo: 'stub',
      periodo: periodoStubEntrada(entrada).periodo,
      valor: valorStub(valorMensalBruto, entrada),
    };
  }
  if (meses >= 2) {
    return { tipo: 'mensal', periodo: periodoMes(ref), valor: round2(valorMensalBruto) };
  }
  return { tipo: 'nenhum', periodo: null, valor: 0 };
}

/** Reparte um valor BRUTO (com IVA) em base + IVA, garantindo total === bruto. */
export function repartirIva(
  valorComIva: number,
  taxaIva: number
): { semIva: number; iva: number; total: number } {
  const semIva = round2(valorComIva / (1 + taxaIva / 100));
  const iva = round2(semIva * (taxaIva / 100));
  return { semIva, iva, total: round2(semIva + iva) };
}
