// src/hooks/useAcordosPagamento.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted() é OBRIGATÓRIO aqui — vi.mock() é hospedado pelo Vitest para o
// TOPO do ficheiro, acima de qualquer `const` normal. Declarar os mocks com
// `const` fora de vi.hoisted() e referenciá-los dentro do factory de vi.mock()
// rebenta em TDZ (ReferenceError) no arranque do teste — exactamente o bug já
// apanhado e corrigido no backend (Tarefa 7, acordoPagamento.test.ts).
const { maybeSingle, selectResponsaveis, rpc, functionsInvoke } = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  selectResponsaveis: vi.fn(),
  rpc: vi.fn(),
  functionsInvoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      if (tabela === 'acordos_pagamento') {
        return { select: () => ({ eq: () => ({ in: () => ({ maybeSingle }) }) }) };
      }
      if (tabela === 'contrato_condutores') {
        return { select: () => ({ eq: () => ({ is: selectResponsaveis }) }) };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    },
    rpc,
    functions: { invoke: functionsInvoke },
  },
}));

import {
  useAcordoAtivoPorCobranca,
  useAcordoResponsaveisElegiveis,
  useCriarAcordo,
  useFaturacaoPreflight,
} from './useAcordosPagamento';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Ficheiro `.test.ts` (não `.tsx`): o parser SWC trata `.ts` com `tsx: false`
// (o próprio TypeScript também recusa sintaxe JSX em `.ts`, por ambiguidade
// com type assertions `<Tipo>valor`) — por isso `React.createElement` em vez
// de JSX, tal como em useContratosRenting.test.ts (mesma pasta).
function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAcordoAtivoPorCobranca', () => {
  it('devolve null quando não há acordo vivo', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useAcordoAtivoPorCobranca('c-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('devolve o acordo quando existe um vivo', async () => {
    maybeSingle.mockResolvedValue({
      data: { id: 'a-1', codigo: 18, estado: 'ativo' },
      error: null,
    });
    const { result } = renderHook(() => useAcordoAtivoPorCobranca('c-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ id: 'a-1', codigo: 18, estado: 'ativo' });
  });

  it('não corre a query sem cobrancaId', () => {
    const { result } = renderHook(() => useAcordoAtivoPorCobranca(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useAcordoResponsaveisElegiveis', () => {
  it('mapeia condutor (cliente_id) e filtra fora as linhas de motorista', async () => {
    // TVDE fatura-se fora do WeGest — acordo_criar recusa sempre
    // responsavel_papel='motorista' (20260724100001), por isso uma linha de
    // contrato_condutores ligada a um motorista nunca deve ser oferecida como
    // candidato elegível: seria um caminho garantido a falhar.
    selectResponsaveis.mockResolvedValue({
      data: [
        {
          cliente_id: 'cli-1',
          motorista_id: null,
          clientes: { nome: 'Maria Sousa' },
        },
        {
          cliente_id: null,
          motorista_id: 'mot-1',
          clientes: null,
        },
      ],
      error: null,
    });
    const { result } = renderHook(() => useAcordoResponsaveisElegiveis('contrato-1'), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ papel: 'condutor', id: 'cli-1', nome: 'Maria Sousa' }]);
  });
});

describe('useCriarAcordo', () => {
  it('chama a RPC acordo_criar com os parâmetros p_* corretos', async () => {
    rpc.mockResolvedValue({ data: 'acordo-uuid-1', error: null });
    const { result } = renderHook(() => useCriarAcordo(), { wrapper });
    result.current.mutate({
      cobrancaId: 'c-1',
      responsavelPapel: 'condutor',
      responsavelId: 'cli-1',
      parcelas: [{ numero: 1, data_vencimento: '2026-08-15', valor: 300 }],
      frequencia: 'mensal',
      diaVencimento: 15,
      avisoAntecedenciaDias: 3,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpc).toHaveBeenCalledWith('acordo_criar', {
      p_cobranca_id: 'c-1',
      p_responsavel_papel: 'condutor',
      p_responsavel_id: 'cli-1',
      p_parcelas: [{ numero: 1, data_vencimento: '2026-08-15', valor: 300 }],
      p_frequencia: 'mensal',
      p_dia_vencimento: 15,
      p_aviso_antecedencia_dias: 3,
      p_observacoes: null,
    });
    expect(result.current.data).toBe('acordo-uuid-1');
  });

  it('lança quando a RPC devolve erro', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'saldo não bate certo' } });
    const { result } = renderHook(() => useCriarAcordo(), { wrapper });
    result.current.mutate({
      cobrancaId: 'c-1',
      responsavelPapel: 'cliente',
      responsavelId: 'cli-1',
      parcelas: [],
      frequencia: 'mensal',
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useFaturacaoPreflight', () => {
  it('invoca a action preflight e devolve o resultado', async () => {
    functionsInvoke.mockResolvedValue({
      data: { ok: true, provider: 'keyinvoice', rc_configurado: true },
      error: null,
    });
    const { result } = renderHook(() => useFaturacaoPreflight(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(functionsInvoke).toHaveBeenCalledWith('faturacao-emitir', {
      body: { action: 'preflight' },
    });
    expect(result.current.data).toEqual({
      ok: true,
      provider: 'keyinvoice',
      rc_configurado: true,
    });
  });

  it('lança quando a chamada falha a nível de transporte', async () => {
    functionsInvoke.mockResolvedValue({ data: null, error: { message: 'timeout' } });
    const { result } = renderHook(() => useFaturacaoPreflight(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
