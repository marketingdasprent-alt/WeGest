import { startOfDay, subDays } from 'date-fns';

/**
 * Intervalo de datas compatível com react-day-picker v8 (Calendar shadcn).
 */
export interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

/**
 * Presets predefinidos + custom.
 * Valores alinhados com os intervalos típicos de dashboard: semana, mês, trimestre, ano.
 */
export type DatePreset = '7d' | '30d' | '90d' | '365d' | 'custom';

/**
 * Opção de preset exibível no DateRangePicker.
 * `getRange` é lazy — só calcula no momento de uso, não na definição.
 */
export interface PresetOption {
  label: string;
  value: DatePreset;
  getRange: () => { from: Date; to: Date };
}

/** Lista canónica de presets. Exportada para reuso no hook e no picker. */
export const PRESET_OPTIONS: PresetOption[] = [
  {
    label: 'Últimos 7 dias',
    value: '7d',
    getRange: () => ({
      from: startOfDay(subDays(new Date(), 6)),
      to: startOfDay(new Date()),
    }),
  },
  {
    label: 'Últimos 30 dias',
    value: '30d',
    getRange: () => ({
      from: startOfDay(subDays(new Date(), 29)),
      to: startOfDay(new Date()),
    }),
  },
  {
    label: 'Últimos 90 dias',
    value: '90d',
    getRange: () => ({
      from: startOfDay(subDays(new Date(), 89)),
      to: startOfDay(new Date()),
    }),
  },
  {
    label: 'Último ano',
    value: '365d',
    getRange: () => ({
      from: startOfDay(subDays(new Date(), 364)),
      to: startOfDay(new Date()),
    }),
  },
];
