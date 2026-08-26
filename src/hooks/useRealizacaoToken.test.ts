import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

import { supabase } from '@/integrations/supabase/client';
import { useRealizarFromToken } from './useRealizacaoToken';

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

function rpcMock() {
  const m = vi.fn().mockResolvedValue({ data: null, error: null });
  (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc = m;
  return m;
}

/**
 * PORQUE ESTE TESTE FIXA O PAYLOAD EXACTO
 *
 * As assinaturas em produção (verificadas a 2026-08-26 em pg_proc) são:
 *
 *   realizar_token_realizacao(p_token uuid, p_km numeric, p_combustivel text,
 *     p_eletricidade text DEFAULT NULL, p_dua_original_levada boolean DEFAULT NULL,
 *     p_dua_devolvida boolean DEFAULT NULL)
 *
 * `p_km` e `p_combustivel` NÃO têm DEFAULT. Passar `undefined` faz o
 * supabase-js omitir a chave do JSON, e o PostgREST deixa de encontrar a
 * função — a confirmação de entrega no telemóvel rebentaria.
 *
 * O tipo gerado diz `p_km: number` (o gerador da Supabase não exprime
 * nulabilidade de ARGUMENTOS), o que convida a "arrumar" o `?? null` para
 * `?? undefined` e satisfazer o type-check. Seria exactamente a troca errada.
 * Este teste trava-a.
 */
describe('useRealizarFromToken — payload das RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('entrega sem leitura de km envia p_km e p_combustivel como NULL, nunca omitidos', async () => {
    const rpc = rpcMock();
    const { result } = renderHook(() => useRealizarFromToken(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({
        token: 'tok-1',
        eventoId: 'ev-1',
        contratoId: 'con-1',
        tipo: 'entrega',
      });
    });

    expect(rpc).toHaveBeenCalledWith('realizar_token_realizacao', {
      p_token: 'tok-1',
      p_km: null,
      p_combustivel: null,
      p_eletricidade: null,
      p_dua_original_levada: null,
      p_dua_devolvida: null,
    });
  });

  it('recolha com dados preenchidos envia os valores tal como recebidos', async () => {
    const rpc = rpcMock();
    const { result } = renderHook(() => useRealizarFromToken(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({
        token: 'tok-2',
        eventoId: 'ev-2',
        contratoId: 'con-2',
        tipo: 'recolha',
        km: 45210,
        combustivel: '1/2',
        eletricidade: '80%',
        duaDevolvida: true,
      });
    });

    expect(rpc).toHaveBeenCalledWith('realizar_token_realizacao', {
      p_token: 'tok-2',
      p_km: 45210,
      p_combustivel: '1/2',
      p_eletricidade: '80%',
      p_dua_original_levada: null,
      p_dua_devolvida: true,
    });
  });

  it('troca usa a RPC dedicada com as duas viaturas e eletricidade a NULL quando não preenchida', async () => {
    const rpc = rpcMock();
    const { result } = renderHook(() => useRealizarFromToken(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({
        token: 'tok-3',
        eventoId: 'ev-3',
        contratoId: 'con-3',
        tipo: 'troca',
        troca: {
          viaturaAntigaId: 'v-antiga',
          kmAntiga: 100,
          combustivelAntiga: 'Cheio',
          eletricidadeAntiga: null,
          viaturaNovaId: 'v-nova',
          kmNova: 5,
          combustivelNova: '3/4',
          eletricidadeNova: null,
        },
      });
    });

    expect(rpc).toHaveBeenCalledWith('realizar_token_troca', {
      p_token: 'tok-3',
      p_viatura_antiga_id: 'v-antiga',
      p_km_antiga: 100,
      p_combustivel_antiga: 'Cheio',
      p_eletricidade_antiga: null,
      p_viatura_nova_id: 'v-nova',
      p_km_nova: 5,
      p_combustivel_nova: '3/4',
      p_eletricidade_nova: null,
    });
  });

  it('troca com dados incompletos falha antes de chamar a RPC', async () => {
    const rpc = rpcMock();
    const { result } = renderHook(() => useRealizarFromToken(), { wrapper: createWrapper() });

    let erro: unknown;
    await act(async () => {
      erro = await result.current
        .mutateAsync({
          token: 'tok-4',
          eventoId: 'ev-4',
          contratoId: 'con-4',
          tipo: 'troca',
          troca: {
            viaturaAntigaId: 'v-antiga',
            kmAntiga: null,
            combustivelAntiga: 'Cheio',
            eletricidadeAntiga: null,
            viaturaNovaId: 'v-nova',
            kmNova: 5,
            combustivelNova: '3/4',
            eletricidadeNova: null,
          },
        })
        .catch((e: unknown) => e);
    });

    expect(erro).toEqual(new Error('Dados da troca incompletos'));
    expect(rpc).not.toHaveBeenCalled();
  });
});
