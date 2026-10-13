import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTemaClaroForcado } from './useTemaClaroForcado';

describe('useTemaClaroForcado', () => {
  it('tira o modo escuro enquanto a página está aberta e repõe-no ao sair', () => {
    const html = document.documentElement;
    html.classList.add('dark');

    const { unmount } = renderHook(() => useTemaClaroForcado());
    expect(html.classList.contains('dark')).toBe(false);
    expect(html.style.colorScheme).toBe('light');

    unmount();
    expect(html.classList.contains('dark')).toBe(true);
    html.classList.remove('dark');
  });

  it('sem modo escuro antes, não o inventa ao sair', () => {
    const html = document.documentElement;
    html.classList.remove('dark');
    const { unmount } = renderHook(() => useTemaClaroForcado());
    unmount();
    expect(html.classList.contains('dark')).toBe(false);
  });
});
