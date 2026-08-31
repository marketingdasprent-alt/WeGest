import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  useClienteElegivelAnuncios,
  useAtualizarElegibilidadeCliente,
  useClienteAnuncios,
  useCriarAnuncio,
  useApagarAnuncio,
  useDesatribuirAnuncio,
} from './useClienteAnuncios';
import { supabase } from '@/integrations/supabase/client';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('useClienteElegivelAnuncios', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lê o campo elegivel_anuncios do cliente', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { elegivel_anuncios: true }, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useClienteElegivelAnuncios('c1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBe(true));
  });

  it('não faz query nenhuma quando clienteId é null', () => {
    const { result } = renderHook(() => useClienteElegivelAnuncios(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('useAtualizarElegibilidadeCliente', () => {
  beforeEach(() => vi.clearAllMocks());

  it('escreve o novo valor no cliente', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ update });

    const { result } = renderHook(() => useAtualizarElegibilidadeCliente(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({ clienteId: 'c1', elegivel: true });

    expect(update).toHaveBeenCalledWith({ elegivel_anuncios: true });
    expect(eq).toHaveBeenCalledWith('id', 'c1');
  });
});

describe('useClienteAnuncios (lista)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('traz os anúncios do cliente, com a matrícula quando há viatura', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'a1',
                cliente_id: 'c1',
                viatura_id: 'v1',
                preco: 50,
                data_inicio: '2026-09-01',
                data_fim: '2026-09-30',
                created_at: '2026-08-31T10:00:00Z',
                viaturas: { matricula: 'AA-00-BB' },
              },
            ],
            error: null,
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useClienteAnuncios('c1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data[0].viatura_matricula).toBe('AA-00-BB');
  });
});

describe('useCriarAnuncio', () => {
  beforeEach(() => vi.clearAllMocks());

  it('insere com viatura_id nulo — nasce sempre sem viatura', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ insert });

    const { result } = renderHook(() => useCriarAnuncio(), { wrapper: createWrapper() });
    await result.current.mutateAsync({
      clienteId: 'c1',
      preco: 50,
      dataInicio: '2026-09-01',
      dataFim: '2026-09-30',
    });

    expect(insert).toHaveBeenCalledWith({
      cliente_id: 'c1',
      preco: 50,
      data_inicio: '2026-09-01',
      data_fim: '2026-09-30',
    });
  });
});

describe('useApagarAnuncio', () => {
  beforeEach(() => vi.clearAllMocks());

  it('só apaga quando não há viatura atribuída', async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: 'a1' }], error: null });
    const is = vi.fn().mockReturnValue({ select });
    const eq = vi.fn().mockReturnValue({ is });
    const del = vi.fn().mockReturnValue({ eq });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ delete: del });

    const { result } = renderHook(() => useApagarAnuncio(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ anuncioId: 'a1' });

    expect(eq).toHaveBeenCalledWith('id', 'a1');
    expect(is).toHaveBeenCalledWith('viatura_id', null);
  });

  // Sem esta guarda, apagar uma linha atribuída deixava a matrícula a apontar
  // para um anúncio que já não existe — a faixa da viatura ficava presa.
  it('recusa com um erro claro quando ainda há viatura atribuída', async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    const is = vi.fn().mockReturnValue({ select });
    const eq = vi.fn().mockReturnValue({ is });
    const del = vi.fn().mockReturnValue({ eq });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ delete: del });

    const { result } = renderHook(() => useApagarAnuncio(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync({ anuncioId: 'a1' })).rejects.toThrow(
      'Desatribui a viatura antes de apagar este anúncio.'
    );
  });
});

describe('useDesatribuirAnuncio', () => {
  beforeEach(() => vi.clearAllMocks());

  it('limpa a viatura sem apagar a linha', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ update });

    const { result } = renderHook(() => useDesatribuirAnuncio(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ anuncioId: 'a1' });

    expect(update).toHaveBeenCalledWith({ viatura_id: null });
    expect(eq).toHaveBeenCalledWith('id', 'a1');
  });
});
