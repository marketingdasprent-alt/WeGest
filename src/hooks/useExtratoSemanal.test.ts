import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/hooks/useMotoristaExtratoPeriodo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/useMotoristaExtratoPeriodo')>()),
  useMotoristaExtratoPeriodo: () => ({ data: undefined, isLoading: false, error: null }),
}));

import { useExtratoSemanal } from './useExtratoSemanal';

const dia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('useExtratoSemanal — corte das contas', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('recua até à semana de 26/10 e aí pára', () => {
    // Segunda 09/11/2026: 09/11 → 02/11 → 26/10.
    vi.setSystemTime(new Date(2026, 10, 9, 10, 0, 0));
    const { result } = renderHook(() => useExtratoSemanal('m1'));

    expect(dia(result.current.inicio)).toBe('2026-11-09');
    expect(result.current.podeAnterior).toBe(true);

    act(() => result.current.anterior());
    act(() => result.current.anterior());
    expect(dia(result.current.inicio)).toBe('2026-10-26');
    expect(result.current.podeAnterior).toBe(false);

    act(() => result.current.anterior());
    expect(dia(result.current.inicio)).toBe('2026-10-26');
    expect(result.current.semanasAtras).toBe(2);
  });

  it('na própria semana de 26/10 não há semana anterior', () => {
    vi.setSystemTime(new Date(2026, 9, 28, 10, 0, 0));
    const { result } = renderHook(() => useExtratoSemanal('m1'));
    expect(result.current.podeAnterior).toBe(false);
  });
});
