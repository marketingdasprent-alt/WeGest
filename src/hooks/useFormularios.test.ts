import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

const h = vi.hoisted(() => ({
  chamadas: [] as Array<{ metodo: string; args: unknown[] }>,
  resposta: { data: null as unknown, error: null as unknown },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((tabela: string) => {
      h.chamadas.push({ metodo: 'from', args: [tabela] });
      const b: Record<string, unknown> = {};
      const encadeia = (nome: string) =>
        vi.fn((...args: unknown[]) => {
          h.chamadas.push({ metodo: nome, args });
          return b;
        });
      b.select = encadeia('select');
      b.eq = encadeia('eq');
      b.order = vi.fn((...args: unknown[]) => {
        h.chamadas.push({ metodo: 'order', args });
        return Promise.resolve(h.resposta);
      });
      b.maybeSingle = vi.fn(() => {
        h.chamadas.push({ metodo: 'maybeSingle', args: [] });
        return Promise.resolve(h.resposta);
      });
      return b;
    }),
  },
}));

import { useFormulariosAtivos, useFormularioPorNome } from './useFormularios';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  h.chamadas = [];
  h.resposta = { data: null, error: null };
});

describe('useFormulariosAtivos', () => {
  it('lê só os formulários activos, ordenados por nome', async () => {
    h.resposta = { data: [{ id: 'f1', nome: 'A', ativo: true }], error: null };

    const { result } = renderHook(() => useFormulariosAtivos(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(h.chamadas).toEqual([
      { metodo: 'from', args: ['formularios'] },
      { metodo: 'select', args: ['id, nome, ativo'] },
      { metodo: 'eq', args: ['ativo', true] },
      { metodo: 'order', args: ['nome'] },
    ]);
    expect(result.current.data).toEqual([{ id: 'f1', nome: 'A', ativo: true }]);
  });

  it('devolve lista vazia quando não há nada (não `null`)', async () => {
    h.resposta = { data: null, error: null };

    const { result } = renderHook(() => useFormulariosAtivos(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
  });

  it('propaga o erro do Postgres em vez de o engolir', async () => {
    // O código anterior fazia `console.error` e seguia com a lista vazia — o
    // select de formulários aparecia vazio sem nada indicar que falhou.
    h.resposta = { data: null, error: { message: 'permission denied' } };

    const { result } = renderHook(() => useFormulariosAtivos(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual({ message: 'permission denied' });
  });
});

describe('useFormularioPorNome', () => {
  it('procura um formulário activo com aquele nome exacto', async () => {
    h.resposta = { data: { id: 'f9', nome: 'Formulário X', campos: [] }, error: null };

    const { result } = renderHook(() => useFormularioPorNome('Formulário X'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(h.chamadas).toEqual([
      { metodo: 'from', args: ['formularios'] },
      { metodo: 'select', args: ['*'] },
      { metodo: 'eq', args: ['nome', 'Formulário X'] },
      { metodo: 'eq', args: ['ativo', true] },
      { metodo: 'maybeSingle', args: [] },
    ]);
  });

  it('não corre sem nome — evita uma query inútil no arranque', async () => {
    const { result } = renderHook(() => useFormularioPorNome(''), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(h.chamadas).toEqual([]);
  });
});
