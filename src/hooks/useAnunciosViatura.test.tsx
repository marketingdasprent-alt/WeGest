import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  useViaturaElegivelAnuncios,
  useAtualizarElegibilidadeViatura,
  useAnuncioDaViatura,
  useAnunciosPorAtribuir,
  useAtribuirAnuncio,
} from './useAnunciosViatura';
import { supabase } from '@/integrations/supabase/client';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('useViaturaElegivelAnuncios', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lê o campo elegivel_anuncios da viatura', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { elegivel_anuncios: true }, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useViaturaElegivelAnuncios('v1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBe(true));
  });
});

describe('useAtualizarElegibilidadeViatura', () => {
  beforeEach(() => vi.clearAllMocks());

  it('escreve o novo valor na viatura', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ update });

    const { result } = renderHook(() => useAtualizarElegibilidadeViatura(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({ viaturaId: 'v1', elegivel: true });

    expect(update).toHaveBeenCalledWith({ elegivel_anuncios: true });
    expect(eq).toHaveBeenCalledWith('id', 'v1');
  });
});

describe('useAnuncioDaViatura', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devolve null quando a viatura não tem anúncio', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() => useAnuncioDaViatura('v1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
  });

  it('traz o anúncio com o nome do cliente quando existe', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'a1',
              cliente_id: 'c1',
              viatura_id: 'v1',
              preco: 50,
              data_inicio: '2026-09-01',
              data_fim: '2026-09-30',
              created_at: '2026-08-31T10:00:00Z',
              clientes: { nome: 'Empresa X' },
            },
            error: null,
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useAnuncioDaViatura('v1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data?.cliente_nome).toBe('Empresa X'));
  });
});

describe('useAnunciosPorAtribuir', () => {
  beforeEach(() => vi.clearAllMocks());

  it('só traz anúncios sem viatura, de clientes elegíveis', async () => {
    const eq = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'a1',
            preco: 50,
            data_inicio: '2026-09-01',
            data_fim: '2026-09-30',
            clientes: { nome: 'Empresa X' },
          },
        ],
        error: null,
      }),
    });
    const is = vi.fn().mockReturnValue({ eq });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
      select: vi.fn().mockReturnValue({ is }),
    });

    const { result } = renderHook(() => useAnunciosPorAtribuir(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(is).toHaveBeenCalledWith('viatura_id', null);
    expect(eq).toHaveBeenCalledWith('clientes.elegivel_anuncios', true);
  });
});

describe('useAtribuirAnuncio', () => {
  beforeEach(() => vi.clearAllMocks());

  it('atribui quando o anúncio ainda está por atribuir', async () => {
    const select = vi.fn().mockResolvedValue({ data: [{ id: 'a1' }], error: null });
    const is = vi.fn().mockReturnValue({ select });
    const eq = vi.fn().mockReturnValue({ is });
    const update = vi.fn().mockReturnValue({ eq });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ update });

    const { result } = renderHook(() => useAtribuirAnuncio(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ anuncioId: 'a1', viaturaId: 'v1' });

    expect(update).toHaveBeenCalledWith({ viatura_id: 'v1' });
    expect(eq).toHaveBeenCalledWith('id', 'a1');
    expect(is).toHaveBeenCalledWith('viatura_id', null);
  });

  // A corrida que a spec pede para fechar: duas viaturas a tentar o mesmo
  // anúncio ao mesmo tempo. Só a primeira escrita afecta uma linha.
  it('recusa com um erro claro quando o anúncio já foi atribuído entretanto', async () => {
    const select = vi.fn().mockResolvedValue({ data: [], error: null });
    const is = vi.fn().mockReturnValue({ select });
    const eq = vi.fn().mockReturnValue({ is });
    const update = vi.fn().mockReturnValue({ eq });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ update });

    const { result } = renderHook(() => useAtribuirAnuncio(), { wrapper: createWrapper() });

    await expect(
      result.current.mutateAsync({ anuncioId: 'a1', viaturaId: 'v1' })
    ).rejects.toThrow('Este anúncio já foi atribuído a outra viatura.');
  });
});
