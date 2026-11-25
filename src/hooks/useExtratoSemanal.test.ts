import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const useResumoSemanaFechada = vi.fn((..._a: unknown[]) => ({
  data: undefined,
  isLoading: false,
  error: null,
}));
vi.mock('@/hooks/useResumoSemanaFechada', () => ({
  useResumoSemanaFechada: (...a: unknown[]) => useResumoSemanaFechada(...a),
}));

import { useExtratoSemanal } from './useExtratoSemanal';

const dia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('useExtratoSemanal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useResumoSemanaFechada.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('abre na semana passada, a última que pode estar fechada', () => {
    vi.setSystemTime(new Date(2026, 10, 25, 10, 0, 0));
    const { result } = renderHook(() => useExtratoSemanal('m1'));
    expect(dia(result.current.inicio)).toBe('2026-11-16');
    expect(result.current.podeSeguinte).toBe(false);
    expect(useResumoSemanaFechada).toHaveBeenLastCalledWith('m1', '2026-11-16');
  });

  it('não avança para a semana em curso', () => {
    vi.setSystemTime(new Date(2026, 10, 25, 10, 0, 0));
    const { result } = renderHook(() => useExtratoSemanal('m1'));
    act(() => result.current.anterior());
    expect(dia(result.current.inicio)).toBe('2026-11-09');
    expect(result.current.podeSeguinte).toBe(true);
    act(() => result.current.seguinte());
    act(() => result.current.seguinte());
    expect(dia(result.current.inicio)).toBe('2026-11-16');
    expect(result.current.semanasAtras).toBe(1);
  });

  it('recua até à semana de 26/10 e aí pára', () => {
    // Segunda 09/11/2026: abre em 02/11 → 26/10.
    vi.setSystemTime(new Date(2026, 10, 9, 10, 0, 0));
    const { result } = renderHook(() => useExtratoSemanal('m1'));
    expect(dia(result.current.inicio)).toBe('2026-11-02');
    expect(result.current.podeAnterior).toBe(true);

    act(() => result.current.anterior());
    expect(dia(result.current.inicio)).toBe('2026-10-26');
    expect(result.current.podeAnterior).toBe(false);

    act(() => result.current.anterior());
    expect(dia(result.current.inicio)).toBe('2026-10-26');
  });
});
