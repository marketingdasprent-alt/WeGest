// Selecção de período dos gráficos das dashboards de início. Vive fora dos
// componentes porque a Frota e a Financeira oferecem exactamente os mesmos
// presets: duas cópias das mesmas quatro etiquetas divergiam à primeira
// alteração.
//
// A ESCOLHA da granularidade não está aqui de propósito — quantas barras cabem
// depende do gráfico (o de faturação lê-se bem com um mês ao dia, o de
// atividade não), por isso cada um decide a sua. O que está aqui é o cálculo
// dos baldes, esse sim igual em toda a parte.
import {
  startOfWeek,
  startOfMonth,
  startOfYear,
  subMonths,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
} from 'date-fns';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale';

/** `personalizado` não tem range fixo — vem das duas datas do calendário. */
export type PeriodPreset = 'semana' | 'mes' | 'trimestre' | 'ano' | 'personalizado';
export type FixedPreset = Exclude<PeriodPreset, 'personalizado'>;

export interface DateRange {
  from: Date;
  to: Date;
}

export const PRESET_LABELS: Record<FixedPreset, string> = {
  semana: 'Esta Semana',
  mes: 'Este Mês',
  trimestre: 'Trimestre',
  ano: 'Este Ano',
};

export function getPeriodRange(preset: FixedPreset): DateRange {
  const now = new Date();
  switch (preset) {
    case 'semana':
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: now };
    case 'mes':
      return { from: startOfMonth(now), to: now };
    case 'trimestre':
      // "Trimestre" = últimos 3 meses corridos (não o trimestre civil) — é o
      // que a operação usa para comparar, e era o comportamento anterior.
      return { from: subMonths(now, 3), to: now };
    case 'ano':
      return { from: startOfYear(now), to: now };
  }
}

/** O que se lê no botão do seletor. */
export function labelDoPeriodo(preset: PeriodPreset, range: DateRange): string {
  return preset === 'personalizado'
    ? `${format(range.from, 'dd MMM', { locale: pt })} – ${format(range.to, 'dd MMM yyyy', { locale: pt })}`
    : PRESET_LABELS[preset];
}

// ── Baldes dos gráficos ──────────────────────────────────────────────────────

export type Granularidade = 'dia' | 'semana' | 'mes';

export interface Balde {
  /** `yyyy-MM-dd` do início do balde — a chave por que se agrupa. */
  chave: string;
  /** O que aparece no eixo. */
  label: string;
}

/** A que balde pertence um dia. */
export function chaveDoBalde(dia: Date, granularidade: Granularidade): string {
  if (granularidade === 'dia') return format(dia, 'yyyy-MM-dd');
  if (granularidade === 'semana')
    return format(startOfWeek(dia, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  return format(startOfMonth(dia), 'yyyy-MM-dd');
}

/**
 * Todos os baldes do intervalo, incluindo os que ficam a zero — sem isto o
 * gráfico encolhe o eixo aos períodos com movimento e dá a impressão de
 * actividade contínua onde não houve nenhuma.
 *
 * O primeiro balde pode começar ANTES de `inicio` (a semana ou o mês que o
 * contém). É de propósito: é lá que caem os dias iniciais do intervalo, e
 * `chaveDoBalde` tem de encontrar a chave.
 */
export function baldesDoIntervalo(inicio: Date, fim: Date, granularidade: Granularidade): Balde[] {
  const intervalo = { start: inicio, end: fim };
  const inicios =
    granularidade === 'dia'
      ? eachDayOfInterval(intervalo)
      : granularidade === 'semana'
        ? eachWeekOfInterval(intervalo, { weekStartsOn: 1 })
        : eachMonthOfInterval(intervalo);

  return inicios.map((d) => ({
    chave: format(d, 'yyyy-MM-dd'),
    label: granularidade === 'mes' ? format(d, 'MMM', { locale: pt }) : format(d, 'dd/MM'),
  }));
}
