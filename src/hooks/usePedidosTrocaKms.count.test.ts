import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { from, contagens, falha } = vi.hoisted(() => {
  const contagens: Record<string, number> = {};
  const falha = { erro: null as Error | null };
  const from = vi.fn((_tabela: string) => ({
    select: (_c: string, _o: unknown) => ({
      eq: (_col: string, _v: string) => ({
        eq: (_col2: string, tipo: string) =>
          Promise.resolve({ count: contagens[tipo] ?? 0, error: falha.erro }),
      }),
    }),
  }));
  return { from, contagens, falha };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { usePedidosPendentesCount } from './usePedidosTrocaKms';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children
  );

describe('usePedidosPendentesCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(contagens)) delete contagens[k];
    falha.erro = null;
  });

  it('soma as contagens por tipo (count head, sem linhas)', async () => {
    Object.assign(contagens, { kms: 2, tarifa: 1 });
    const { result } = renderHook(() => usePedidosPendentesCount(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(from).toHaveBeenCalledWith('pedidos_alteracao_contrato');
    expect(result.current.data).toEqual({ total: 3, porTipo: { kms: 2, tarifa: 1 } });
  });

  it('não consulta quando desactivado', () => {
    const { result } = renderHook(() => usePedidosPendentesCount(false), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(from).not.toHaveBeenCalled();
  });

  it('propaga o erro do Supabase', async () => {
    falha.erro = new Error('rls');
    const { result } = renderHook(() => usePedidosPendentesCount(true), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
