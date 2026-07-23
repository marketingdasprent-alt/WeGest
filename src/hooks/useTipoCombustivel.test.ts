import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

import { supabase } from '@/integrations/supabase/client';
import { useTipoCombustivel } from './useTipoCombustivel';

type SupabaseResult = { data: unknown; error: unknown };

function chainable(result: SupabaseResult) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  c.select = vi.fn().mockReturnValue(c);
  c.eq = vi.fn().mockReturnValue(c);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  return c;
}

function setupSupabase(tableResults: Record<string, SupabaseResult>) {
  (supabase as unknown as { from: ReturnType<typeof vi.fn> }).from = vi
    .fn()
    .mockImplementation((table: string) =>
      chainable(tableResults[table] ?? { data: null, error: null })
    );
}

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('useTipoCombustivel', () => {
  it('resolve o nome do catálogo quando a viatura tem combustivel_id', async () => {
    setupSupabase({
      viaturas: {
        data: { combustivel: 'Gasolina (texto antigo)', combustivel_id: 'cat-1' },
        error: null,
      },
      viatura_combustiveis: { data: { nome: 'Híbrido/Gasolina' }, error: null },
    });

    const { result } = renderHook(() => useTipoCombustivel('vit-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBe('Híbrido/Gasolina'));
  });

  it('cai para o texto legado quando não há combustivel_id', async () => {
    setupSupabase({
      viaturas: { data: { combustivel: 'Diesel', combustivel_id: null }, error: null },
    });

    const { result } = renderHook(() => useTipoCombustivel('vit-2'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBe('Diesel'));
  });

  it('não faz query quando viaturaId é null', () => {
    setupSupabase({});
    const { result } = renderHook(() => useTipoCombustivel(null), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe('idle');
  });
});
