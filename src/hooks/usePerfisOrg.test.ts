import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: rpcMock },
}));

import { fetchPerfisOrg, usePerfisOrg, MAX_IDS_POR_PEDIDO } from './usePerfisOrg';

beforeEach(() => {
  rpcMock.mockReset();
});

describe('fetchPerfisOrg', () => {
  it('lista vazia: devolve [] sem chamar a RPC', async () => {
    await expect(fetchPerfisOrg([])).resolves.toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('só ids vazios: devolve [] sem chamar a RPC', async () => {
    await expect(fetchPerfisOrg(['', ''])).resolves.toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('faz dedupe dos ids e ignora vazios antes de chamar perfis_org', async () => {
    rpcMock.mockResolvedValue({ data: [{ id: 'u1', nome: 'Alice' }], error: null });
    const perfis = await fetchPerfisOrg(['u1', 'u2', 'u1', '', 'u2']);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('perfis_org', { p_ids: ['u1', 'u2'] });
    expect(perfis).toEqual([{ id: 'u1', nome: 'Alice' }]);
  });

  it('data a null devolve []', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await expect(fetchPerfisOrg(['u1'])).resolves.toEqual([]);
  });

  it('erro da RPC é propagado, nunca engolido', async () => {
    const erro = new Error('permission denied for function perfis_org');
    rpcMock.mockResolvedValue({ data: null, error: erro });
    await expect(fetchPerfisOrg(['u1'])).rejects.toBe(erro);
  });

  it('acima de MAX_IDS_POR_PEDIDO parte em lotes e junta os resultados', async () => {
    const ids = Array.from({ length: MAX_IDS_POR_PEDIDO + 1 }, (_, i) => `u${i}`);
    rpcMock.mockImplementation((_fn: string, args: { p_ids: string[] }) =>
      Promise.resolve({ data: args.p_ids.map((id) => ({ id, nome: id })), error: null })
    );
    const perfis = await fetchPerfisOrg(ids);
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls[0][1].p_ids).toHaveLength(MAX_IDS_POR_PEDIDO);
    expect(rpcMock.mock.calls[1][1].p_ids).toEqual([`u${MAX_IDS_POR_PEDIDO}`]);
    expect(perfis).toHaveLength(MAX_IDS_POR_PEDIDO + 1);
  });
});

describe('usePerfisOrg', () => {
  function wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return React.createElement(QueryClientProvider, { client: qc }, children);
  }

  it('sem ids fica desactivado e não chama a RPC', () => {
    const { result } = renderHook(() => usePerfisOrg([]), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('com ids devolve os perfis e normaliza os ids (ordenados, sem repetidos)', async () => {
    rpcMock.mockResolvedValue({ data: [{ id: 'u1', nome: 'Alice' }], error: null });
    const { result } = renderHook(() => usePerfisOrg(['u2', 'u1', 'u2']), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcMock).toHaveBeenCalledWith('perfis_org', { p_ids: ['u1', 'u2'] });
    expect(result.current.data).toEqual([{ id: 'u1', nome: 'Alice' }]);
  });
});
