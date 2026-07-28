// src/hooks/useAcordoDetalhe.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// vi.hoisted: vi.mock() é hospedado ao topo do ficheiro pelo Vitest, antes de
// qualquer `const` normal — referenciar estes spies como `const` simples faria a
// factory correr antes de eles existirem (TDZ). Mesmo padrão já corrigido 2x
// nesta feature (backend Tarefa 7, 4A useAcordosPagamento.test.ts).
const { fromMock, rpcMock, registarPagamentoParcela } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  registarPagamentoParcela: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: fromMock, rpc: rpcMock },
}));

vi.mock('@/lib/acordoPagamento', () => ({
  registarPagamentoParcela: (...a: unknown[]) => registarPagamentoParcela(...a),
}));

import { useAcordoDetalhe, useRegistarPagamento } from './useAcordoDetalhe';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

const ACORDO_ROW = {
  id: 'a-1',
  codigo: 7,
  estado: 'ativo',
  valor_total: 900,
  titular_id: 't-1',
  titular_nome: 'João Martins',
  titular_nif: '234567890',
  responsavel_nome: 'João Martins',
  responsavel_papel: 'cliente',
  responsavel_cliente_id: 't-1',
  responsavel_motorista_id: null,
  cobranca_id: 'c-1',
  invoice_id: 'inv-1',
};

const PARCELAS_ROWS = [
  {
    id: 'p-1',
    numero: 1,
    data_vencimento: '2026-08-01',
    valor: 300,
    estado: 'paga',
    aviso_enviado_em: '2026-07-25T10:00:00Z',
    invoice_rc_id: 'rc-1',
  },
  {
    id: 'p-2',
    numero: 2,
    data_vencimento: '2026-09-01',
    valor: 300,
    estado: 'liquidacao_pendente',
    aviso_enviado_em: null,
    invoice_rc_id: null,
  },
];

const OUTBOX_ROWS = [{ parcela_id: 'p-2', estado: 'suspenso' }];

function mockFromChain(table: string) {
  if (table === 'acordos_pagamento') {
    return {
      select: () => ({ eq: () => ({ single: async () => ({ data: ACORDO_ROW, error: null }) }) }),
    };
  }
  if (table === 'acordo_parcelas') {
    return {
      select: () => ({
        eq: () => ({ order: async () => ({ data: PARCELAS_ROWS, error: null }) }),
      }),
    };
  }
  if (table === 'faturacao_outbox') {
    return { select: () => ({ in: async () => ({ data: OUTBOX_ROWS, error: null }) }) };
  }
  if (table === 'invoices') {
    return {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { numero: 'FT 2026/9' }, error: null }) }),
      }),
    };
  }
  // A dívida (contrato_id) vive em contrato_cobrancas, ligada por cobranca_id.
  // Segunda query separada em vez de embed PostgREST — ver nota de resolução
  // no ficheiro de implementação.
  if (table === 'contrato_cobrancas') {
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { contrato_id: 'ct-1' }, error: null }),
        }),
      }),
    };
  }
  throw new Error(`tabela inesperada no teste: ${table}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  fromMock.mockImplementation(mockFromChain);
  // Default: cobranca_saldo_por_liquidar devolve 250 — sobreposto no teste
  // dedicado a faltaPagar quando é preciso um valor diferente.
  rpcMock.mockResolvedValue({ data: 250, error: null });
});

describe('useAcordoDetalhe', () => {
  it('junta acordo + parcelas + outbox num objeto só', async () => {
    const { result } = renderHook(() => useAcordoDetalhe('a-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.codigo).toBe(7);
    expect(result.current.data?.parcelas).toHaveLength(2);
  });

  it('marca a parcela p-2 como suspenso (liquidacao_pendente + outbox suspenso)', async () => {
    const { result } = renderHook(() => useAcordoDetalhe('a-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const p2 = result.current.data?.parcelas.find((p) => p.id === 'p-2');
    expect(p2?.suspenso).toBe(true);
  });

  it('p-1 (paga, sem linha de outbox) nao fica marcada suspenso', async () => {
    const { result } = renderHook(() => useAcordoDetalhe('a-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const p1 = result.current.data?.parcelas.find((p) => p.id === 'p-1');
    expect(p1?.suspenso).toBe(false);
  });

  it('numeroFaturaOriginal vem de invoices via invoice_id', async () => {
    const { result } = renderHook(() => useAcordoDetalhe('a-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.numeroFaturaOriginal).toBe('FT 2026/9');
  });

  it('contratoId vem de contrato_cobrancas via cobranca_id', async () => {
    const { result } = renderHook(() => useAcordoDetalhe('a-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.contratoId).toBe('ct-1');
  });

  it('faltaPagar vem da RPC cobranca_saldo_por_liquidar (fonte única de verdade, nunca somado das parcelas)', async () => {
    rpcMock.mockResolvedValue({ data: 250, error: null });
    const { result } = renderHook(() => useAcordoDetalhe('a-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcMock).toHaveBeenCalledWith('cobranca_saldo_por_liquidar', { p_cobranca_id: 'c-1' });
    expect(result.current.data?.faltaPagar).toBe(250);
  });
});

describe('useRegistarPagamento', () => {
  it('chama registarPagamentoParcela com o input recebido', async () => {
    registarPagamentoParcela.mockResolvedValue({ estado: 'paga' });
    const { result } = renderHook(() => useRegistarPagamento(), { wrapper });
    const input = {
      parcelaId: 'p-2',
      orgId: 'o-1',
      acordoId: 'a-1',
      entidadeId: 't-1',
      contratoId: null,
      cobrancaId: 'c-1',
      valor: 300,
      data: '2026-09-01',
      metodo: 'transferencia',
      numeroFaturaOriginal: 'FT 2026/9',
      titular: { nome: 'João Martins', nif: '234567890' },
      parcelaNumero: 2,
      totalParcelas: 2,
      acordoCodigo: 7,
    };
    await result.current.mutateAsync(input);
    expect(registarPagamentoParcela).toHaveBeenCalledWith(input);
  });
});
