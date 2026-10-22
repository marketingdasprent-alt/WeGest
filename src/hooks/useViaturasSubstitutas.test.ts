import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useViaturasSubstitutas } from './useViaturasSubstitutas';

const filtros: unknown[][] = [];
let resposta: { data: unknown[] | null; error: unknown } = { data: [], error: null };

beforeEach(() => {
  filtros.length = 0;
  resposta = { data: [], error: null };
  const b: Record<string, unknown> = {};
  const filtro =
    (nome: string) =>
    (...args: unknown[]) => {
      filtros.push([nome, ...args]);
      return b;
    };
  b.select = filtro('select');
  b.eq = filtro('eq');
  b.neq = filtro('neq');
  b.or = filtro('or');
  b.order = (...args: unknown[]) => {
    filtros.push(['order', ...args]);
    return Promise.resolve(resposta);
  };
  vi.mocked(supabase.from).mockReturnValue(b as unknown as ReturnType<typeof supabase.from>);
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

describe('useViaturasSubstitutas', () => {
  it('só traz disponíveis que não sejam slot nem vendidas (NULL conta como não)', async () => {
    const { result } = renderHook(() => useViaturasSubstitutas(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(filtros).toEqual([
      ['select', 'id, matricula, marca, modelo, status, km_atual'],
      ['eq', 'status', 'disponivel'],
      ['or', 'is_slot.is.null,is_slot.eq.false'],
      ['or', 'is_vendida.is.null,is_vendida.eq.false'],
      ['order', 'matricula'],
    ]);
  });

  it('exclui a viatura que entra em assistência', async () => {
    const { result } = renderHook(() => useViaturasSubstitutas({ excluirViaturaId: 'v1' }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(filtros).toContainEqual(['neq', 'id', 'v1']);
  });

  it('devolve as linhas com status sempre preenchido', async () => {
    resposta = {
      data: [
        { id: 'v2', matricula: 'AA-00-AA', marca: 'A', modelo: 'B', status: null, km_atual: 1 },
      ],
      error: null,
    };
    const { result } = renderHook(() => useViaturasSubstitutas(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([
      {
        id: 'v2',
        matricula: 'AA-00-AA',
        marca: 'A',
        modelo: 'B',
        status: 'disponivel',
        km_atual: 1,
      },
    ]);
  });

  it('não corre enquanto não for preciso (modal fechado / sem viatura escolhida)', () => {
    const { result } = renderHook(() => useViaturasSubstitutas({ enabled: false }), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(filtros).toHaveLength(0);
  });

  it('erro do Postgres chega como erro da query', async () => {
    resposta = { data: null, error: { message: 'permission denied' } };
    const { result } = renderHook(() => useViaturasSubstitutas(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual({ message: 'permission denied' });
  });
});
