import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

const h = vi.hoisted(() => ({
  associado: { data: null as unknown, error: null as unknown },
  livres: { data: null as unknown, error: null as unknown },
  updates: [] as Array<{ payload: unknown; id: unknown }>,
  erroUpdate: null as unknown,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => {
      const b: Record<string, unknown> = {};
      let payloadUpdate: unknown;
      b.select = vi.fn(() => b);
      b.eq = vi.fn((_c: string, valor: unknown) => {
        if (payloadUpdate !== undefined) {
          h.updates.push({ payload: payloadUpdate, id: valor });
          return Promise.resolve({ data: null, error: h.erroUpdate });
        }
        // .eq('viatura_id', x) -> ramo do dispositivo associado
        b.maybeSingle = vi.fn(() => Promise.resolve(h.associado));
        return b;
      });
      b.is = vi.fn(() => b);
      b.order = vi.fn(() => Promise.resolve(h.livres));
      b.maybeSingle = vi.fn(() => Promise.resolve(h.associado));
      b.update = vi.fn((p: unknown) => {
        payloadUpdate = p;
        return b;
      });
      return b;
    }),
  },
}));

import {
  useViaturaObeDispositivos,
  useAssociarDispositivoObe,
  useRemoverDispositivoObe,
} from './useViaturaObe';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  h.associado = { data: null, error: null };
  h.livres = { data: null, error: null };
  h.updates = [];
  h.erroUpdate = null;
});

describe('useViaturaObeDispositivos', () => {
  it('devolve o dispositivo associado e os que estão livres', async () => {
    h.associado = { data: { id: 'd1', nr_equipamento: 'OBE-1' }, error: null };
    h.livres = { data: [{ id: 'd2', nr_equipamento: 'OBE-2' }], error: null };

    const { result } = renderHook(() => useViaturaObeDispositivos('v1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.atual).toEqual({ id: 'd1', nr_equipamento: 'OBE-1' });
    expect(result.current.data?.disponiveis).toEqual([{ id: 'd2', nr_equipamento: 'OBE-2' }]);
  });

  it('viatura sem dispositivo devolve atual=null e nunca undefined', async () => {
    const { result } = renderHook(() => useViaturaObeDispositivos('v1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.atual).toBeNull();
    expect(result.current.data?.disponiveis).toEqual([]);
  });

  it('não corre sem viatura — evita uma query inútil', () => {
    const { result } = renderHook(() => useViaturaObeDispositivos(''), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('mutations do dispositivo OBE', () => {
  it('associar liga o dispositivo escolhido à viatura', async () => {
    const { result } = renderHook(() => useAssociarDispositivoObe(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ dispositivoId: 'd2', viaturaId: 'v1' });
    });

    expect(h.updates).toEqual([{ payload: { viatura_id: 'v1' }, id: 'd2' }]);
  });

  it('remover desliga a associação pondo viatura_id a NULL', async () => {
    const { result } = renderHook(() => useRemoverDispositivoObe(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ dispositivoId: 'd1', viaturaId: 'v1' });
    });

    expect(h.updates).toEqual([{ payload: { viatura_id: null }, id: 'd1' }]);
  });

  it('erro do Postgres propaga em vez de dar sucesso silencioso', async () => {
    h.erroUpdate = { message: 'permission denied' };
    const { result } = renderHook(() => useAssociarDispositivoObe(), { wrapper });

    let erro: unknown;
    await act(async () => {
      erro = await result.current
        .mutateAsync({ dispositivoId: 'd2', viaturaId: 'v1' })
        .catch((e: unknown) => e);
    });

    expect(erro).toEqual({ message: 'permission denied' });
  });
});
