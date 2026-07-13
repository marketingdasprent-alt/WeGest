import { useState, useMemo, useCallback } from 'react';

import type { DateRange, DatePreset } from '@/types/dateRange';
import { PRESET_OPTIONS } from '@/types/dateRange';

interface UseDateRangeReturn {
  /** Intervalo calculado com base no preset activo (ou custom). */
  dateRange: DateRange;
  /** Preset actualmente seleccionado. */
  preset: DatePreset;
  /** Alternar para um preset predefinido. */
  setPreset: (preset: DatePreset) => void;
  /** Definir intervalo custom (desactiva preset definido). */
  setCustomRange: (range: DateRange) => void;
  /** Lista de opções de preset disponíveis. */
  presets: typeof PRESET_OPTIONS;
  /** Se o intervalo actual é custom (vs preset). */
  isCustom: boolean;
}

/**
 * Hook de intervalo de datas com presets + suporte a custom range.
 *
 * State puramente local — **não faz queries Supabase**.
 * Usa `useMemo` para calcular as datas apenas quando o preset/custom muda.
 *
 * @example
 * ```ts
 * const { dateRange, preset, setPreset, setCustomRange } = useDateRange();
 * // dateRange.from / dateRange.to prontos para filtrar queries
 * ```
 */
export function useDateRange(initialPreset: DatePreset = '30d'): UseDateRangeReturn {
  const [preset, setPresetState] = useState<DatePreset>(initialPreset);
  const [customRange, setCustomRangeState] = useState<DateRange>({ from: undefined, to: undefined });

  const isCustom = preset === 'custom';

  const dateRange = useMemo<DateRange>(() => {
    if (isCustom) {
      return customRange;
    }
    const option = PRESET_OPTIONS.find((o) => o.value === preset);
    if (!option) {
      return { from: undefined, to: undefined };
    }
    return option.getRange();
  }, [preset, customRange, isCustom]);

  const setCustomRange = useCallback((range: DateRange) => {
    setPresetState('custom');
    setCustomRangeState(range);
  }, []);

  const setPreset = useCallback((newPreset: DatePreset) => {
    setPresetState(newPreset);
    if (newPreset !== 'custom') {
      setCustomRangeState({ from: undefined, to: undefined });
    }
  }, []);

  return {
    dateRange,
    preset,
    setPreset,
    setCustomRange,
    presets: PRESET_OPTIONS,
    isCustom,
  };
}
