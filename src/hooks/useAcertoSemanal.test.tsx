import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const maybeSingle = vi.fn();
const select = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ select: (...a: unknown[]) => (select(...a), { eq: () => ({ maybeSingle }) }) }),
  },
}));

import { useAcertoSemanal } from './useAcertoSemanal';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const linha = {
  id: 'a1',
  semana_inicio: '2026-11-09',
  semana_fim: '2026-11-15',
  liquido: '538.85',
};

describe('useAcertoSemanal', () => {
  beforeEach(() => {
    maybeSingle.mockReset();
    select.mockReset();
  });

  it('devolve a semana com o detalhe quando a base o tem', async () => {
    const detalhe = {
      versao: 1,
      receitas: { bolt: 10, uber: 20, outras: 0 },
      totalReceitas: 30,
      despesas: {
        aluguer: 0,
        combustivel: 0,
        portagens: 0,
        outros_custos: 0,
        slot: 0,
        caucao: 0,
        seguros: 0,
        reparacoes: 0,
      },
      totalDespesas: 0,
      retencao: null,
      liquido: 30,
    };
    maybeSingle.mockResolvedValue({ data: { ...linha, detalhe }, error: null });
    const { result } = renderHook(() => useAcertoSemanal('a1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.liquido).toBe(538.85);
    expect(result.current.data?.detalhe?.totalReceitas).toBe(30);
  });

  it('base sem a coluna detalhe: tenta de novo sem ela e devolve só o valor', async () => {
    maybeSingle
      .mockResolvedValueOnce({
        data: null,
        error: { code: '42703', message: 'column "detalhe" does not exist' },
      })
      .mockResolvedValueOnce({ data: linha, error: null });
    const { result } = renderHook(() => useAcertoSemanal('a1'), { wrapper });
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.data?.detalhe).toBeNull();
    expect(result.current.data?.liquido).toBe(538.85);
    expect(select).toHaveBeenCalledTimes(2);
    expect(select.mock.calls[1][0]).not.toContain('detalhe');
  });

  it('outro erro da base continua a ser erro', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { code: '57014', message: 'timeout' } });
    const { result } = renderHook(() => useAcertoSemanal('a1'), { wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('semana que a política não deixa ver vem vazia', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useAcertoSemanal('a1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
