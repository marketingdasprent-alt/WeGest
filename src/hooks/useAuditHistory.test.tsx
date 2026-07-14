import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useAuditHistory } from './useAuditHistory';
import { supabase } from '@/integrations/supabase/client';

// ── Helpers ──────────────────────────────────────────────────

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

/**
 * Configura o mock de `supabase.from` para uma única tabela.
 * A cadeia .select().eq().order().limit() retorna uma promise com { data, error }.
 */
function mockFromResolve(data: unknown[], error: unknown = null) {
  const mockLimit = vi.fn().mockResolvedValue({ data, error });
  const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
  const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
  (supabase as unknown as { from: unknown }).from = mockFrom;
  return mockFrom;
}

/**
 * Configura o mock de `supabase.from` com respostas sequenciais via
 * mockResolvedValueOnce — útil quando o hook faz múltiplas queries.
 */
function mockFromResolveSequence(results: unknown[][]) {
  const mockLimit = vi.fn();
  // Cada chamada a .limit(n) devolve uma promise diferente
  for (const data of results) {
    mockLimit.mockResolvedValueOnce({ data, error: null });
  }

  const mockOrder = vi.fn().mockReturnValue({ limit: mockLimit });
  const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
  const mockFrom = vi.fn().mockReturnValue({ select: mockSelect });
  (supabase as unknown as { from: unknown }).from = mockFrom;
  return { mockFrom };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ────────────────────────────────────────────────────

describe('useAuditHistory', () => {
  it('retorna undefined (disabled) para entidades sem tabelas (reserva)', async () => {
    mockFromResolve([]);

    const { result } = renderHook(() => useAuditHistory({ entidade: 'reserva', id: 'any-id' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // enabled=false → query não corre → data é undefined
    expect(result.current.data).toBeUndefined();
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('retorna undefined (disabled) para entidades sem tabelas (motorista)', async () => {
    const { result } = renderHook(() => useAuditHistory({ entidade: 'motorista', id: 'any-id' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
  });

  it('consulta lead_status_history para entidade lead', async () => {
    const now = new Date().toISOString();
    const fakeRows = [
      {
        id: 'h1',
        lead_id: 'lead-1',
        status_anterior: 'novo',
        status_novo: 'contactado',
        alterado_por: 'user-1',
        alterado_em: now,
        observacoes: 'Primeiro contacto',
      },
    ];

    mockFromResolve(fakeRows);

    const { result } = renderHook(() => useAuditHistory({ entidade: 'lead', id: 'lead-1' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0]).toMatchObject({
      entidade: 'lead',
      tabelaOrigem: 'lead_status_history',
      acao: 'mudanca_status',
      actorId: 'user-1',
      detalhe: 'Primeiro contacto',
      createdAt: now,
    });
    expect(supabase.from).toHaveBeenCalledWith('lead_status_history');
  });

  it('consulta calendario_eventos_historico para entidade calendario', async () => {
    const now = new Date().toISOString();
    const fakeRows = [
      {
        id: 'h2',
        evento_id: 'evt-1',
        editado_por: 'user-2',
        campo: 'titulo',
        valor_anterior: 'Antigo',
        valor_novo: 'Novo',
        editado_em: now,
      },
    ];

    mockFromResolve(fakeRows);

    const { result } = renderHook(() => useAuditHistory({ entidade: 'calendario', id: 'evt-1' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0]).toMatchObject({
      entidade: 'calendario',
      tabelaOrigem: 'calendario_eventos_historico',
      acao: 'titulo',
      actorId: 'user-2',
      detalhe: 'titulo: Antigo → Novo',
    });
  });

  it('consulta as 3 tabelas de histórico para entidade contrato', async () => {
    mockFromResolve([]);

    const { result } = renderHook(
      () => useAuditHistory({ entidade: 'contrato', id: 'contrato-1', options: { limit: 100 } }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([]);
    // Deve ter chamado from() 3 vezes (uma por tabela)
    expect(supabase.from).toHaveBeenCalledTimes(3);
    expect(supabase.from).toHaveBeenCalledWith('contrato_historico');
    expect(supabase.from).toHaveBeenCalledWith('contratos_edicoes');
    expect(supabase.from).toHaveBeenCalledWith('contratos_reimpressoes');
  });

  it('não faz query quando id é vazio', async () => {
    const { result } = renderHook(() => useAuditHistory({ entidade: 'lead', id: '' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // enabled=false (id vazio) → data undefined
    expect(result.current.data).toBeUndefined();
  });

  it('propaga erro da query Supabase', async () => {
    mockFromResolve([], new Error('Erro de BD'));

    const { result } = renderHook(() => useAuditHistory({ entidade: 'lead', id: 'lead-1' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeDefined();
    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe('Erro de BD');
  });

  it('ordena resultados por createdAt descendente quando mistura tabelas', async () => {
    const earlier = '2026-01-01T00:00:00.000Z';
    const later = '2026-06-15T00:00:00.000Z';

    const results = [
      // contrato_historico (later)
      [
        {
          id: 'h1',
          contrato_id: 'c1',
          evento_tipo: 'contrato_aberto',
          ator_id: null,
          detalhe: null,
          criado_em: later,
        },
      ],
      // contratos_edicoes (earlier)
      [
        {
          id: 'h2',
          contrato_id: 'c1',
          editado_por: 'u1',
          editado_em: earlier,
          campos_alterados: { status: 'ativo' },
          observacoes: null,
        },
      ],
      // contratos_reimpressoes → vazio
      [],
    ];

    mockFromResolveSequence(results);

    const { result } = renderHook(() => useAuditHistory({ entidade: 'contrato', id: 'c1' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(2);
    // O mais recente primeiro
    expect(result.current.data![0].createdAt).toBe(later);
    expect(result.current.data![0].tabelaOrigem).toBe('contrato_historico');
    expect(result.current.data![1].createdAt).toBe(earlier);
    expect(result.current.data![1].tabelaOrigem).toBe('contratos_edicoes');
  });
});
