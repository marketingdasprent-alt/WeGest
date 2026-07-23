import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...actual, useReducedMotion: vi.fn() };
});

import { useSimplifiedMotion } from './useSimplifiedMotion';
import { useReducedMotion } from 'framer-motion';

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

describe('useSimplifiedMotion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('é false em desktop sem preferência de movimento reduzido', () => {
    vi.mocked(useReducedMotion).mockReturnValue(false);
    mockMatchMedia(false);

    const { result } = renderHook(() => useSimplifiedMotion());

    expect(result.current).toBe(false);
  });

  it('é true em viewport mobile mesmo sem preferência de movimento reduzido', () => {
    vi.mocked(useReducedMotion).mockReturnValue(false);
    mockMatchMedia(true);

    const { result } = renderHook(() => useSimplifiedMotion());

    expect(result.current).toBe(true);
  });

  it('é true com prefers-reduced-motion mesmo em desktop', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    mockMatchMedia(false);

    const { result } = renderHook(() => useSimplifiedMotion());

    expect(result.current).toBe(true);
  });
});
