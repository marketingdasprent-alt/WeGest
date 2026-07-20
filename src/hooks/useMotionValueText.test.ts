import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMotionValue } from 'framer-motion';
import { useMotionValueText } from './useMotionValueText';

describe('useMotionValueText', () => {
  it('devolve o texto inicial formatado', () => {
    const { result: mv } = renderHook(() => useMotionValue(0));
    const { result } = renderHook(() => useMotionValueText(mv.current, (v) => `${v}€`));

    expect(result.current).toBe('0€');
  });

  it('actualiza o texto quando o motion value muda', () => {
    const { result: mv } = renderHook(() => useMotionValue(0));
    const { result } = renderHook(() => useMotionValueText(mv.current, (v) => `${v}€`));

    act(() => {
      mv.current.set(42);
    });

    expect(result.current).toBe('42€');
  });
});
