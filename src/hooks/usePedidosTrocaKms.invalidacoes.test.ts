import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: m.rpc,
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from: (t: string) =>
      t === 'user_org_ativa'
        ? { select: () => ({ maybeSingle: async () => ({ data: { org_id: 'o1' } }) }) }
        : { insert: m.insert },
  },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { useCriarPedidoTrocaKms, useResponderPedidoTrocaKms } from './usePedidosTrocaKms';

function montar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return { spy, wrapper };
}

const chaves = (spy: ReturnType<typeof montar>['spy']) =>
  spy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);

describe('invalidações dos pedidos de alteração', () => {
  beforeEach(() => vi.clearAllMocks());

  it('criar invalida todo o prefixo dos pedidos', async () => {
    m.insert.mockResolvedValue({ error: null });
    const { spy, wrapper } = montar();
    const { result } = renderHook(() => useCriarPedidoTrocaKms(), { wrapper });
    result.current.mutate({
      contratoId: 'c1',
      tipo: 'preco_semana',
      valorAtual: 1,
      valorPedido: 2,
      motivo: 'x',
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(chaves(spy)).toContainEqual(['pedidos-troca-kms']);
  });

  it('responder invalida pedidos, contratos e preço semanal', async () => {
    m.rpc.mockResolvedValue({ error: null });
    const { spy, wrapper } = montar();
    const { result } = renderHook(() => useResponderPedidoTrocaKms(), { wrapper });
    result.current.mutate({ pedidoId: 'p1', aceite: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const k = chaves(spy);
    expect(k).toContainEqual(['pedidos-troca-kms']);
    expect(k).toContainEqual(['renting', 'contratos']);
    expect(k).toContainEqual(['preco-semanal-tvde']);
  });
});
