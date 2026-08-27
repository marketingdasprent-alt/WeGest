import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

const h = vi.hoisted(() => ({
  resposta: { data: null as unknown, error: null as unknown },
  rpcs: [] as Array<{ fn: string; args: unknown }>,
  erroRpc: null as unknown,
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn((fn: string, args: unknown) => {
      h.rpcs.push({ fn, args });
      return Promise.resolve({ data: null, error: h.erroRpc });
    }),
    from: vi.fn(() => {
      const b: Record<string, unknown> = {};
      b.select = vi.fn(() => b);
      b.is = vi.fn(() => b);
      b.eq = vi.fn(() => b);
      b.order = vi.fn(() => {
        const o: Record<string, unknown> = { order: vi.fn(() => Promise.resolve(h.resposta)) };
        (o as unknown as { then: unknown }).then = (
          resolve: (v: unknown) => void,
          reject?: (r: unknown) => void
        ) => Promise.resolve(h.resposta).then(resolve, reject);
        return o;
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
  h.rpcs = [];
  h.erroRpc = null;
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

/**
 * PORQUE ESTES TESTES OLHAM PARA A RPC E NÃO PARA AS ESCRITAS
 *
 * Atribuir e devolver tocam em DUAS tabelas: `cartoes_frota` e a coluna
 * `cartao_<tipo>` da ficha em `motoristas_ativos` (que alimenta o match das
 * transacções importadas). Feitas do cliente eram duas chamadas PostgREST sem
 * transacção — se a segunda falhasse, o cartão ficava atribuído e a ficha não,
 * e o consumo deixava de ser imputado ao motorista sem ninguém dar por isso.
 *
 * Passaram para `atribuir_cartao_frota` / `devolver_cartao_frota`, que fazem as
 * duas escritas numa só transacção. O comportamento das escritas é verificado
 * contra a base de dados (teste transaccional na migração 20260826131640); o
 * que se fixa aqui é o CONTRATO: que o hook chama a RPC certa, com o id certo,
 * e que não volta a escrever nas tabelas directamente.
 */
describe('mutações de cartão de frota', () => {
  it('associar chama a RPC atómica, não duas escritas soltas', async () => {
    const { result } = renderHook(() => useAssociarCartaoAoMotorista(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ cartaoId: 'c1', motoristaId: 'm1' });
    });

    expect(h.rpcs).toEqual([
      { fn: 'atribuir_cartao_frota', args: { p_cartao_id: 'c1', p_motorista_id: 'm1' } },
    ]);
  });

  it('devolver chama a RPC atómica só com o cartão', async () => {
    // O motorista não vai no payload: a RPC lê-o do próprio cartão. Aqui só
    // serve para invalidar a query certa.
    const { result } = renderHook(() => useDevolverCartaoDoMotorista(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ cartaoId: 'c1', motoristaId: 'm1' });
    });

    expect(h.rpcs).toEqual([{ fn: 'devolver_cartao_frota', args: { p_cartao_id: 'c1' } }]);
  });

  it('sincronizar ficha deriva tipo e número do cartão, não do cliente', async () => {
    const { result } = renderHook(() => useSincronizarFichaCartao(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ cartaoId: 'c1', motoristaId: 'm1' });
    });

    expect(h.rpcs).toEqual([{ fn: 'sincronizar_ficha_cartao_frota', args: { p_cartao_id: 'c1' } }]);
  });

  it('erro da RPC propaga — sem sucesso silencioso', async () => {
    h.erroRpc = { message: 'Sem permissão para gerir cartões de frota' };
    const { result } = renderHook(() => useAssociarCartaoAoMotorista(), { wrapper });

    let erro: unknown;
    await act(async () => {
      erro = await result.current
        .mutateAsync({ cartaoId: 'c1', motoristaId: 'm1' })
        .catch((e: unknown) => e);
    });

    expect(erro).toEqual({ message: 'Sem permissão para gerir cartões de frota' });
  });
});
