import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFundoTransparente } from './useFundoTransparente';

describe('useFundoTransparente', () => {
  it('em embed põe o fundo transparente e repõe-no ao sair', () => {
    document.body.style.background = 'rgb(240, 240, 240)';
    const { unmount } = renderHook(() => useFundoTransparente(true));
    expect(document.body.style.background).toBe('transparent');
    expect(document.documentElement.style.background).toBe('transparent');
    unmount();
    expect(document.body.style.background).toBe('rgb(240, 240, 240)');
    document.body.style.background = '';
  });

  it('fora de embed não toca no fundo', () => {
    document.body.style.background = 'rgb(240, 240, 240)';
    renderHook(() => useFundoTransparente(false));
    expect(document.body.style.background).toBe('rgb(240, 240, 240)');
    document.body.style.background = '';
  });
});
