import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

/**
 * PORQUE ESTE TESTE OLHA PARA A QUERY E NÃO PARA O RESULTADO
 *
 * O defeito é de ordenação no servidor: `execute_automation_runs()` insere
 * dezenas de linhas na MESMA transacção, e em Postgres `now()` é o mesmo
 * valor exacto para toda a transacção — todas as linhas ficam com o mesmo
 * `created_at`. Um `ORDER BY created_at DESC` sozinho deixa a ordem entre
 * empates indefinida, e pode devolvê-la diferente de query para query: a
 * página 2 repete linhas da página 1 e omite outras, em silêncio.
 *
 * Reproduzir isso a sério exige um Postgres real (é o teste pgTAP D-paginação).
 * O que se pode fixar aqui é o contrato com o cliente Supabase: a query tem
 * de levar sempre uma segunda coluna de desempate. É o mesmo tipo de
 * asserção que se faz sobre os parâmetros de um pedido HTTP.
 */

const h = vi.hoisted(() => ({
  ordenacoes: [] as Array<[string, unknown]>,
  resposta: { data: [] as unknown[], error: null as unknown, count: 0 },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => {
      const b: Record<string, unknown> = {};
      b.select = vi.fn(() => b);
      b.eq = vi.fn(() => b);
      b.limit = vi.fn(() => Promise.resolve(h.resposta));
      b.order = vi.fn((coluna: string, opcoes: unknown) => {
        h.ordenacoes.push([coluna, opcoes]);
        return b;
      });
      b.range = vi.fn(() => Promise.resolve(h.resposta));
      return b;
    }),
  },
}));

import { useNotificacoesHistorico } from './useNotificacoesHistorico';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  h.ordenacoes = [];
});

describe('useNotificacoesHistorico', () => {
  it('ordena por created_at e desempata por id, para a paginação ser estável', async () => {
    const { result } = renderHook(() => useNotificacoesHistorico(false), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(h.ordenacoes).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ]);
  });
});
