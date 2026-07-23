import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useTicketDanos } from './useTicketDanos';
import { supabase } from '@/integrations/supabase/client';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

/** viatura_danos → .select().eq().order(); viatura_dano_fotos → .select().eq() */
function mockDanosAndFotos(danos: unknown[], fotosByDanoId: Record<string, unknown[]>) {
  const mockFrom = vi.fn((table: string) => {
    if (table === 'viatura_danos') {
      const order = vi.fn().mockResolvedValue({ data: danos, error: null });
      const eq = vi.fn().mockReturnValue({ order });
      const select = vi.fn().mockReturnValue({ eq });
      return { select };
    }
    if (table === 'viatura_dano_fotos') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn((_col: string, danoId: string) =>
            Promise.resolve({ data: fotosByDanoId[danoId] || [], error: null })
          ),
        }),
      };
    }
    throw new Error(`tabela inesperada: ${table}`);
  });
  (supabase as unknown as { from: unknown }).from = mockFrom;
  return mockFrom;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useTicketDanos', () => {
  it('não faz query quando ticketId é undefined', async () => {
    const mockFrom = mockDanosAndFotos([], {});
    const { result } = renderHook(() => useTicketDanos(undefined), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('devolve os danos ligados ao ticket, com categoria e fotos', async () => {
    mockDanosAndFotos(
      [
        {
          id: 'd1',
          descricao: 'Risco na porta',
          localizacao: 'lateral_esq',
          data_ocorrencia: null,
          created_at: '2026-07-20T10:00:00.000Z',
          categoria: { id: 'cat1', nome: 'Sinistro', cor: '#EC4899' },
        },
      ],
      { d1: [{ id: 'f1', ficheiro_url: 'x.jpg', nome_ficheiro: 'x.jpg', descricao: null }] }
    );

    const { result } = renderHook(() => useTicketDanos('ticket-1'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data![0].categoria?.nome).toBe('Sinistro');
    expect(result.current.data![0].fotos).toHaveLength(1);
  });

  it('devolve lista vazia quando o ticket não tem danos ligados', async () => {
    mockDanosAndFotos([], {});
    const { result } = renderHook(() => useTicketDanos('ticket-2'), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([]);
  });
});
