import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { addDays, startOfDay, subDays } from 'date-fns';

import { useDateRange } from './useDateRange';
import type { DatePreset } from '@/types/dateRange';

/**
 * `useDateRange` — testa presets, custom range e transições entre estados.
 *
 * Usamos `vi.useFakeTimers()` para ter datas determinísticas.
 */

const NOW = new Date('2026-07-10T12:00:00Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDateRange', () => {
  it('deve usar preset padrão 30d se nenhum for passado', () => {
    const { result } = renderHook(() => useDateRange());

    expect(result.current.preset).toBe('30d');
    expect(result.current.isCustom).toBe(false);
  });

  it('deve usar o preset inicial passado', () => {
    const { result } = renderHook(() => useDateRange('7d'));

    expect(result.current.preset).toBe('7d');
  });

  it('preset "7d" deve retornar from = 6 dias atrás e to = hoje', () => {
    const { result } = renderHook(() => useDateRange('7d'));

    expect(result.current.dateRange.from).toEqual(startOfDay(subDays(NOW, 6)));
    expect(result.current.dateRange.to).toEqual(startOfDay(NOW));
  });

  it('preset "30d" deve retornar from = 29 dias atrás e to = hoje', () => {
    const { result } = renderHook(() => useDateRange('30d'));

    expect(result.current.dateRange.from).toEqual(startOfDay(subDays(NOW, 29)));
    expect(result.current.dateRange.to).toEqual(startOfDay(NOW));
  });

  it('preset "90d" deve retornar from = 89 dias atrás e to = hoje', () => {
    const { result } = renderHook(() => useDateRange('90d'));

    expect(result.current.dateRange.from).toEqual(startOfDay(subDays(NOW, 89)));
    expect(result.current.dateRange.to).toEqual(startOfDay(NOW));
  });

  it('preset "365d" deve retornar from = 364 dias atrás e to = hoje', () => {
    const { result } = renderHook(() => useDateRange('365d'));

    expect(result.current.dateRange.from).toEqual(startOfDay(subDays(NOW, 364)));
    expect(result.current.dateRange.to).toEqual(startOfDay(NOW));
  });

  it('deve alternar entre presets com setPreset', () => {
    const { result } = renderHook(() => useDateRange('7d'));

    act(() => {
      result.current.setPreset('90d');
    });

    expect(result.current.preset).toBe('90d');
    expect(result.current.dateRange.from).toEqual(startOfDay(subDays(NOW, 89)));
    expect(result.current.dateRange.to).toEqual(startOfDay(NOW));
  });

  it('deve alternar de preset para outro preset e recalcular datas', () => {
    const { result } = renderHook(() => useDateRange('30d'));

    act(() => {
      result.current.setPreset('365d');
    });

    expect(result.current.preset).toBe('365d');
    expect(result.current.dateRange.from).toEqual(startOfDay(subDays(NOW, 364)));
    expect(result.current.dateRange.to).toEqual(startOfDay(NOW));
  });

  it('setCustomRange deve marcar como custom e actualizar range', () => {
    const { result } = renderHook(() => useDateRange());

    const custom = {
      from: startOfDay(subDays(NOW, 14)),
      to: startOfDay(subDays(NOW, 7)),
    };

    act(() => {
      result.current.setCustomRange(custom);
    });

    expect(result.current.isCustom).toBe(true);
    expect(result.current.preset).toBe('custom');
    expect(result.current.dateRange.from).toEqual(custom.from);
    expect(result.current.dateRange.to).toEqual(custom.to);
  });

  it('deve voltar a preset depois de custom', () => {
    const { result } = renderHook(() => useDateRange());

    const custom = {
      from: startOfDay(subDays(NOW, 14)),
      to: startOfDay(subDays(NOW, 7)),
    };

    act(() => {
      result.current.setCustomRange(custom);
    });

    expect(result.current.isCustom).toBe(true);

    act(() => {
      result.current.setPreset('7d');
    });

    expect(result.current.isCustom).toBe(false);
    expect(result.current.preset).toBe('7d');
    expect(result.current.dateRange.from).toEqual(startOfDay(subDays(NOW, 6)));
    expect(result.current.dateRange.to).toEqual(startOfDay(NOW));
  });

  it('presets array deve ter 4 entradas (7d, 30d, 90d, 365d)', () => {
    const { result } = renderHook(() => useDateRange());

    expect(result.current.presets).toHaveLength(4);
    const values = result.current.presets.map((p) => p.value);
    expect(values).toEqual(['7d', '30d', '90d', '365d']);
  });

  it('deve manter datas consistentes ao re-renderizar sem mudanças', () => {
    const { result, rerender } = renderHook(() => useDateRange('7d'));

    const first = result.current.dateRange;

    rerender();

    expect(result.current.dateRange.from).toEqual(first.from);
    expect(result.current.dateRange.to).toEqual(first.to);
  });

  it('edge case: custom range com from e to no mesmo dia', () => {
    const { result } = renderHook(() => useDateRange());

    const sameDay = {
      from: startOfDay(NOW),
      to: startOfDay(NOW),
    };

    act(() => {
      result.current.setCustomRange(sameDay);
    });

    expect(result.current.isCustom).toBe(true);
    expect(result.current.dateRange.from).toEqual(sameDay.from);
    expect(result.current.dateRange.to).toEqual(sameDay.to);
  });
});
