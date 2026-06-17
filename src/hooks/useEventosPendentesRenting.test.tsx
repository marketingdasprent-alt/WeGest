import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useEventosPendentesRenting } from './useEventosPendentesRenting';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook que alimenta as listas de pendentes de renting (entrega/recolha).
 * Faz fetch em 3 passos (eventos → contratos_renting → profiles) e junta
 * tudo. Testa-se o mapeamento e a propagação de erro do 1.º passo.
 */

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

/** Builder encadeável + aguardável que resolve sempre para `result`. */
function builderFor(result: { data: unknown; error: unknown }) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'lte', 'gte', 'neq']) {
    b[m] = vi.fn(() => b);
  }
  (b as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(result);
  return b;
}

function routeTables(map: Record<string, { data: unknown; error: unknown }>) {
  (supabase.from as unknown as ReturnType<typeof vi.fn>).mockImplementation((table: string) =>
    builderFor(map[table] ?? { data: [], error: null })
  );
}

describe('useEventosPendentesRenting', () => {
  beforeEach(() => vi.clearAllMocks());

  it('junta evento + contrato + autor num único registo', async () => {
    routeTables({
      calendario_eventos: {
        data: [
          {
            id: 'ev1',
            titulo: 'AA00AA',
            cidade: 'Leiria',
            data_inicio: '2026-06-20T10:00:00Z',
            matricula_devolver: null,
            origem_id: 'ct1',
          },
        ],
        error: null,
      },
      contratos_renting: {
        data: [{ id: 'ct1', codigo: 42, created_at: '2026-06-01T09:00:00Z', created_by: 'u1' }],
        error: null,
      },
      profiles: { data: [{ id: 'u1', nome: 'Ana Gestora' }], error: null },
    });

    const { result } = renderHook(() => useEventosPendentesRenting({ tipo: 'entrega' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    const ev = result.current.data![0];
    expect(ev.id).toBe('ev1');
    expect(ev.contrato_codigo).toBe(42);
    expect(ev.aberto_em).toBe('2026-06-01T09:00:00Z');
    expect(ev.aberto_por).toBe('Ana Gestora');
  });

  it('devolve [] quando não há eventos pendentes (sem ir buscar contratos)', async () => {
    routeTables({ calendario_eventos: { data: [], error: null } });

    const { result } = renderHook(() => useEventosPendentesRenting({ tipo: 'recolha' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('mapeia aberto_por como null quando o autor não é encontrado', async () => {
    routeTables({
      calendario_eventos: {
        data: [
          {
            id: 'ev2',
            titulo: 'BB11BB',
            cidade: null,
            data_inicio: '2026-06-21T10:00:00Z',
            matricula_devolver: 'BB-11-BB',
            origem_id: 'ct2',
          },
        ],
        error: null,
      },
      contratos_renting: {
        data: [{ id: 'ct2', codigo: 7, created_at: '2026-06-02T09:00:00Z', created_by: null }],
        error: null,
      },
      profiles: { data: [], error: null },
    });

    const { result } = renderHook(() => useEventosPendentesRenting({ tipo: 'recolha' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const ev = result.current.data![0];
    expect(ev.contrato_codigo).toBe(7);
    expect(ev.aberto_por).toBeNull();
  });

  it('propaga erro do fetch de eventos', async () => {
    routeTables({ calendario_eventos: { data: null, error: new Error('rls denied') } });

    const { result } = renderHook(() => useEventosPendentesRenting({ tipo: 'entrega' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });

  it('não corre quando enabled=false', () => {
    const { result } = renderHook(() => useEventosPendentesRenting({ tipo: 'entrega', enabled: false }), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.fetchStatus).toBe('idle');
  });
});
