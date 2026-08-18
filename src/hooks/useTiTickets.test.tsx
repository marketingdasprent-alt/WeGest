import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useCriarTicketComoAdmin } from './useTiTickets';
import { supabase } from '@/integrations/supabase/client';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

/** profiles → select().eq().single(); ti_tickets → insert().select().single() */
function mockCriacao(ticketId: string) {
  (supabase as unknown as { auth: { getUser: unknown } }).auth.getUser = vi
    .fn()
    .mockResolvedValue({ data: { user: { id: 'u1' } } });

  (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((tabela: string) => {
    if (tabela === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { nome: 'Ana', email: 'ana@exemplo.pt', org_id: 'org-1' },
              error: null,
            }),
          }),
        }),
      };
    }
    if (tabela === 'ti_tickets') {
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { id: ticketId }, error: null }),
          }),
        }),
      };
    }
    throw new Error(`tabela inesperada: ${tabela}`);
  });
}

describe('useCriarTicketComoAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('avisa o suporte do pedido acabado de abrir', async () => {
    mockCriacao('t1');
    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true },
      error: null,
    });

    const { result } = renderHook(() => useCriarTicketComoAdmin(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ descricao: 'O portátil não liga' });

    expect(supabase.functions.invoke).toHaveBeenCalledWith('ti-ticket-novo-email', {
      body: { ticket_id: 't1' },
    });
  });

  // Sem isto, o admin via "Pedido aberto." e ficava convencido de que o suporte
  // tinha sido avisado, mesmo quando o email não saiu.
  it('reporta que o aviso não saiu quando o email falha', async () => {
    mockCriacao('t2');
    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: new Error('Brevo 500'),
    });

    const { result } = renderHook(() => useCriarTicketComoAdmin(), { wrapper: createWrapper() });
    const r = await result.current.mutateAsync({ descricao: 'Impressora encravada' });

    expect(r).toEqual({ emailFalhou: true });
  });

  it('o pedido continua aberto quando o aviso sai bem', async () => {
    mockCriacao('t3');
    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true },
      error: null,
    });

    const { result } = renderHook(() => useCriarTicketComoAdmin(), { wrapper: createWrapper() });
    const r = await result.current.mutateAsync({ descricao: 'Rato sem bateria' });

    expect(r).toEqual({ emailFalhou: false });
  });
});
