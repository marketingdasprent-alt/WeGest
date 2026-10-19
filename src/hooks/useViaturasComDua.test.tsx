import { describe, it, expect, vi } from 'vitest';
import React, { type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { TIPOS_DUA, useViaturasComDua } from './useViaturasComDua';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useViaturasComDua', () => {
  it('frente, verso ou legado contam como DUA; cada viatura aparece uma vez', async () => {
    const pedido = {
      select: vi.fn(() => pedido),
      in: vi.fn(() => pedido),
      order: vi.fn(() => pedido),
      range: vi.fn(async () => ({
        data: [{ viatura_id: 'v-1' }, { viatura_id: 'v-1' }, { viatura_id: 'v-2' }],
        error: null,
      })),
    };
    (supabase as unknown as { from: unknown }).from = vi.fn(() => pedido);

    const { result } = renderHook(() => useViaturasComDua(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.from).toHaveBeenCalledWith('viatura_documentos');
    expect(pedido.in).toHaveBeenCalledWith('tipo_documento', TIPOS_DUA);
    expect(TIPOS_DUA).toEqual(['dua_frente', 'dua_verso', 'dua']);
    expect([...result.current.data!]).toEqual(['v-1', 'v-2']);
  });
});
