import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

type Escrita = { tabela: string; payload: unknown; id: unknown };

const h = vi.hoisted(() => ({
  resposta: { data: null as unknown, error: null as unknown },
  escritas: [] as Escrita[],
  erroEscrita: null as unknown,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((tabela: string) => {
      const b: Record<string, unknown> = {};
      let payloadUpdate: unknown;
      b.select = vi.fn(() => b);
      b.is = vi.fn(() => b);
      b.eq = vi.fn((_c: string, valor: unknown) => {
        if (payloadUpdate !== undefined) {
          h.escritas.push({ tabela, payload: payloadUpdate, id: valor });
          return Promise.resolve({ data: null, error: h.erroEscrita });
        }
        return b;
      });
      b.order = vi.fn(() => {
        const o: Record<string, unknown> = {
          order: vi.fn(() => Promise.resolve(h.resposta)),
        };
        (o as unknown as { then: unknown }).then = (
          resolve: (v: unknown) => void,
          reject?: (r: unknown) => void
        ) => Promise.resolve(h.resposta).then(resolve, reject);
        return o;
      });
      b.update = vi.fn((p: unknown) => {
        payloadUpdate = p;
        return b;
      });
      return b;
    }),
  },
}));

import {
  useCartoesAssociados,
  useCartoesDisponiveis,
  useAssociarCartaoAoMotorista,
  useDevolverCartaoDoMotorista,
  useSincronizarFichaCartao,
} from './useCartoesFrota';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  h.resposta = { data: null, error: null };
  h.escritas = [];
  h.erroEscrita = null;
});

describe('leitura de cartões de frota', () => {
  it('cartões associados devolve lista vazia em vez de null', async () => {
    const { result } = renderHook(() => useCartoesAssociados('m1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('cartões disponíveis não corre sem tipo', () => {
    const { result } = renderHook(() => useCartoesDisponiveis(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('associar cartão a motorista', () => {
  it('marca o cartão em uso E grava o número na ficha do motorista', async () => {
    const { result } = renderHook(() => useAssociarCartaoAoMotorista(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        cartaoId: 'c1',
        numero: '123',
        tipo: 'bp',
        motoristaId: 'm1',
        hoje: '2026-08-26',
      });
    });

    expect(h.escritas).toEqual([
      {
        tabela: 'cartoes_frota',
        payload: { motorista_id: 'm1', status: 'em_uso', data_entrega: '2026-08-26' },
        id: 'c1',
      },
      { tabela: 'motoristas_ativos', payload: { cartao_bp: '123' }, id: 'm1' },
    ]);
  });

  it('falha na primeira escrita não tenta a segunda', async () => {
    // As duas escritas não são transaccionais. Falhar cedo é o menos mau:
    // evita a ficha apontar para um cartão que não ficou atribuído.
    h.erroEscrita = { message: 'permission denied' };
    const { result } = renderHook(() => useAssociarCartaoAoMotorista(), { wrapper });

    let erro: unknown;
    await act(async () => {
      erro = await result.current
        .mutateAsync({ cartaoId: 'c1', numero: '123', tipo: 'bp', motoristaId: 'm1', hoje: 'x' })
        .catch((e: unknown) => e);
    });

    expect(erro).toEqual({ message: 'permission denied' });
    expect(h.escritas).toHaveLength(1);
  });
});

describe('devolver cartão', () => {
  it('liberta o cartão e guarda quem o tinha', async () => {
    const { result } = renderHook(() => useDevolverCartaoDoMotorista(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        cartaoId: 'c1',
        tipo: 'bp',
        motoristaId: 'm1',
        limparFicha: false,
        hoje: '2026-08-26',
      });
    });

    expect(h.escritas).toEqual([
      {
        tabela: 'cartoes_frota',
        payload: {
          motorista_id: null,
          ultimo_motorista_id: 'm1',
          status: 'disponivel',
          data_devolucao: '2026-08-26',
        },
        id: 'c1',
      },
    ]);
  });

  it('só limpa a ficha quando ela aponta mesmo para este cartão', async () => {
    const { result } = renderHook(() => useDevolverCartaoDoMotorista(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        cartaoId: 'c1',
        tipo: 'bp',
        motoristaId: 'm1',
        limparFicha: true,
        hoje: '2026-08-26',
      });
    });

    expect(h.escritas[1]).toEqual({
      tabela: 'motoristas_ativos',
      payload: { cartao_bp: null },
      id: 'm1',
    });
  });
});

describe('sincronizar ficha', () => {
  it('copia o número do cartão para a coluna do tipo respectivo', async () => {
    const { result } = renderHook(() => useSincronizarFichaCartao(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ motoristaId: 'm1', tipo: 'edp', numero: '999' });
    });

    expect(h.escritas).toEqual([
      { tabela: 'motoristas_ativos', payload: { cartao_edp: '999' }, id: 'm1' },
    ]);
  });
});
