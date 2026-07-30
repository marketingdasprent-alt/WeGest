import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: rpcMock },
}));

import { useAcordoVistaDevedor, useMeusAcordosAtivos } from './useAcordoVistaDevedor';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

const RPC_RESULT = {
  id: 'a-1',
  codigo: 7,
  estado: 'ativo',
  valor_total: 900,
  falta_pagar: 300,
  parcelas: [
    { numero: 1, data_vencimento: '2026-08-01', valor: 300, estado: 'paga', tem_recibo: true },
    { numero: 2, data_vencimento: '2026-09-01', valor: 300, estado: 'paga', tem_recibo: false },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  rpcMock.mockResolvedValue({ data: RPC_RESULT, error: null });
});

describe('useAcordoVistaDevedor', () => {
  it('chama a RPC acordo_vista_devedor com o id certo', async () => {
    const { result } = renderHook(() => useAcordoVistaDevedor('a-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcMock).toHaveBeenCalledWith('acordo_vista_devedor', { p_acordo_id: 'a-1' });
  });

  it('normaliza os campos snake_case para camelCase', async () => {
    const { result } = renderHook(() => useAcordoVistaDevedor('a-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.faltaPagar).toBe(300);
    expect(result.current.data?.parcelas[1].temRecibo).toBe(false);
  });

  it('devolve null sem acordoId, sem chamar a RPC', async () => {
    const { result } = renderHook(() => useAcordoVistaDevedor(undefined), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('propaga o erro da RPC (ex.: sem permissão)', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'Sem permissão para consultar este acordo.' },
    });
    const { result } = renderHook(() => useAcordoVistaDevedor('a-1'), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useMeusAcordosAtivos', () => {
  it('chama a RPC motorista_meus_acordos_ativos e normaliza os campos', async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: 'a-1', codigo: 7, falta_pagar: 143.5 }],
      error: null,
    });
    const { result } = renderHook(() => useMeusAcordosAtivos(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcMock).toHaveBeenCalledWith('motorista_meus_acordos_ativos', {});
    expect(result.current.data).toEqual([{ id: 'a-1', codigo: 7, faltaPagar: 143.5 }]);
  });

  it('devolve [] para quem não tem nenhum acordo ativo (ou não é motorista)', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useMeusAcordosAtivos(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
