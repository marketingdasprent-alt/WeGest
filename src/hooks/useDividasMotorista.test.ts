// src/hooks/useDividasMotorista.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  dividasSelect,
  danosSelect,
  caucaoSelect,
  motoristaSelect,
  rpcSaldo,
  insert,
  update,
  getUser,
  profileSelect,
  toastError,
} = vi.hoisted(() => ({
  dividasSelect: vi.fn(),
  danosSelect: vi.fn(),
  caucaoSelect: vi.fn(),
  motoristaSelect: vi.fn(),
  rpcSaldo: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  getUser: vi.fn(),
  profileSelect: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: toastError } }));

// Declarações `function` (não `const`) de propósito: ficam hoisted por
// inteiro (não só a binding, o corpo também) antes do módulo correr, tal
// como as entradas de vi.hoisted() acima — ao contrário de uma `const`, que
// ficaria em TDZ no momento em que o factory de vi.mock() é executado.
function tabelaDividasEncadeavel() {
  const builder: any = {
    order: () => builder,
    eq: () => builder,
    ilike: () => builder,
    neq: () => builder,
    then: (onFulfilled: any, onRejected: any) => dividasSelect().then(onFulfilled, onRejected),
  };
  return builder;
}

/** As duas queries a motorista_financeiro partem do mesmo prefixo
 *  (.eq('motorista_id').eq('categoria', …)) e só a dos danos continua com
 *  .gte()/.lte(). Um builder encadeável e thenable serve as duas: aceita os
 *  passos extra e resolve com o mock certo quando o `await` acontecer. */
function movimentosEncadeavel(resolver: () => Promise<unknown>) {
  const builder: any = {
    gte: () => builder,
    lte: () => builder,
    then: (onFulfilled: any, onRejected: any) => resolver().then(onFulfilled, onRejected),
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (nome: string, args: unknown) => rpcSaldo(nome, args),
    from: (tabela: string) => {
      if (tabela === 'dividas_motorista') {
        return {
          // A query real encadeia .order()/.eq()/.ilike() condicionalmente
          // (só entram quando há filtro) e depois é feito `await` do que
          // sobrar da cadeia. Uma cadeia rígida só chegaria a `dividasSelect`
          // quando TODOS os métodos fossem chamados pela ordem exacta —
          // falhava logo no teste com filtros vazios.
          select: () => tabelaDividasEncadeavel(),
          insert,
          update: (vals: unknown) => ({ eq: (col: string, id: string) => update(vals, col, id) }),
        };
      }
      if (tabela === 'motorista_financeiro') {
        return {
          select: () => ({
            eq: () => ({
              eq: (_col: string, categoria: string) =>
                movimentosEncadeavel(categoria === 'reparacao' ? danosSelect : caucaoSelect),
            }),
          }),
        };
      }
      if (tabela === 'motoristas_ativos') {
        return { select: () => ({ eq: () => ({ single: motoristaSelect }) }) };
      }
      if (tabela === 'profiles') {
        return { select: () => ({ eq: () => ({ single: profileSelect }) }) };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    },
    auth: { getUser },
  },
}));

import {
  useDividasMotorista,
  useCalcularDivida,
  useCriarDivida,
  useAtualizarEstadoDivida,
  useDividasAbertasDoMotorista,
} from './useDividasMotorista';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDividasMotorista', () => {
  it('lista as dívidas, mais recentes primeiro (delegado à query)', async () => {
    dividasSelect.mockResolvedValue({
      data: [{ id: 'd-1', motorista_nome: 'Ana Costa', valor_total: 90 }],
      error: null,
    });
    const { result } = renderHook(() => useDividasMotorista({}), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { id: 'd-1', motorista_nome: 'Ana Costa', valor_total: 90 },
    ]);
  });
});

describe('useCalcularDivida', () => {
  it('não corre sem motoristaId', () => {
    const { result } = renderHook(
      () => useCalcularDivida(null, { inicio: '2026-08-01', fim: '2026-08-07' }),
      { wrapper }
    );
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('não corre com fim anterior a início', () => {
    const { result } = renderHook(
      () => useCalcularDivida('m-1', { inicio: '2026-08-10', fim: '2026-08-01' }),
      { wrapper }
    );
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('o saldo vem do RPC motorista_saldo_pendente, sem limite de data', async () => {
    rpcSaldo.mockResolvedValue({ data: 1135, error: null });
    danosSelect.mockResolvedValue({ data: [], error: null });
    caucaoSelect.mockResolvedValue({ data: [], error: null });
    motoristaSelect.mockResolvedValue({ data: { nome: 'Ana Costa' }, error: null });

    const { result } = renderHook(
      () => useCalcularDivida('m-1', { inicio: '2026-08-01', fim: '2026-08-07' }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpcSaldo).toHaveBeenCalledWith('motorista_saldo_pendente', { p_motorista_id: 'm-1' });
    expect(result.current.data?.valorPeriodo).toBe(1135);
  });

  it('combina saldo + danos + caução + nome do motorista', async () => {
    rpcSaldo.mockResolvedValue({ data: -100, error: null });
    danosSelect.mockResolvedValue({
      data: [{ tipo: 'debito', categoria: 'reparacao', valor: 20, status: 'pendente' }],
      error: null,
    });
    caucaoSelect.mockResolvedValue({
      data: [{ tipo: 'credito', categoria: 'caucao', valor: 40, status: 'pendente' }],
      error: null,
    });
    motoristaSelect.mockResolvedValue({ data: { nome: 'Ana Costa' }, error: null });

    const { result } = renderHook(
      () => useCalcularDivida('m-1', { inicio: '2026-08-01', fim: '2026-08-07' }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      valorPeriodo: -100,
      valorDanos: 20,
      valorCaucao: 40,
      valorTotal: 80, // 100 + 20 - 40
      motoristaNome: 'Ana Costa',
    });
  });

  it('saldo nulo do RPC (motorista sem movimentos) é tratado como zero', async () => {
    rpcSaldo.mockResolvedValue({ data: null, error: null });
    danosSelect.mockResolvedValue({ data: [], error: null });
    caucaoSelect.mockResolvedValue({ data: [], error: null });
    motoristaSelect.mockResolvedValue({ data: { nome: 'Ana Costa' }, error: null });

    const { result } = renderHook(
      () => useCalcularDivida('m-1', { inicio: '2026-08-01', fim: '2026-08-07' }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.valorPeriodo).toBe(0);
  });
});

describe('useCriarDivida', () => {
  it('insere com os valores dados e o utilizador da sessão', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
    profileSelect.mockResolvedValue({ data: { nome: 'Bruno Paulo' } });
    insert.mockResolvedValue({ error: null });

    const { result } = renderHook(() => useCriarDivida(), { wrapper });
    result.current.mutate({
      motoristaId: 'm-1',
      motoristaNome: 'Ana Costa',
      periodoInicio: '2026-08-01',
      periodoFim: '2026-08-07',
      valores: { valorPeriodo: -100, valorDanos: 0, valorCaucao: 40, valorTotal: 60 },
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        motorista_id: 'm-1',
        motorista_nome: 'Ana Costa',
        periodo_inicio: '2026-08-01',
        periodo_fim: '2026-08-07',
        valor_periodo: -100,
        valor_danos: 0,
        valor_caucao: 40,
        valor_total: 60,
        criado_por: 'u-1',
        criado_por_nome: 'Bruno Paulo',
      })
    );
  });
});

describe('useAtualizarEstadoDivida', () => {
  it('marcar paga grava estado e pago_em', async () => {
    update.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useAtualizarEstadoDivida(), { wrapper });
    result.current.mutate({ id: 'd-1', estado: 'paga' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [vals, col, id] = update.mock.calls[0];
    expect(col).toBe('id');
    expect(id).toBe('d-1');
    expect(vals.estado).toBe('paga');
    expect(vals.pago_em).toEqual(expect.any(String));
  });

  it('cancelar grava estado sem pago_em', async () => {
    update.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useAtualizarEstadoDivida(), { wrapper });
    result.current.mutate({ id: 'd-1', estado: 'cancelada' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const [vals] = update.mock.calls[0];
    expect(vals.estado).toBe('cancelada');
    expect(vals.pago_em).toBeNull();
  });

  it('mostra toast de erro quando a mutação falha (ecrã de dinheiro não pode falhar em silêncio)', async () => {
    update.mockResolvedValue({ error: { message: 'falha de rede' } });
    const { result } = renderHook(() => useAtualizarEstadoDivida(), { wrapper });
    result.current.mutate({ id: 'd-1', estado: 'paga' });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toastError).toHaveBeenCalledWith('Erro ao atualizar a dívida: falha de rede');
  });
});

describe('useDividasAbertasDoMotorista', () => {
  it('não corre sem motoristaId', () => {
    const { result } = renderHook(() => useDividasAbertasDoMotorista(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('lista dívidas abertas (não canceladas, com caução por liquidar) do motorista', async () => {
    dividasSelect.mockResolvedValue({
      data: [
        { id: 'd-1', periodo_inicio: '2026-07-01', periodo_fim: '2026-07-07', valor_caucao: 100 },
      ],
      error: null,
    });
    const { result } = renderHook(() => useDividasAbertasDoMotorista('m-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { id: 'd-1', periodo_inicio: '2026-07-01', periodo_fim: '2026-07-07', valor_caucao: 100 },
    ]);
  });
});
