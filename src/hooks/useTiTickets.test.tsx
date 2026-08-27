import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useCriarTicketComoAdmin, useMarcarResolvido, useReabrirTicket } from './useTiTickets';
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

/**
 * Mock para as transições de estado: `ti_tickets` responde a
 * select().eq().single() e a update().eq().
 */
function mockTransicao(statusActual: string) {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

  (supabase as unknown as { auth: { getUser: unknown } }).auth.getUser = vi
    .fn()
    .mockResolvedValue({ data: { user: { id: 'u1' } } });

  (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((tabela: string) => {
    if (tabela === 'profiles') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { nome: 'Bruno Paulo', email: 'bruno@exemplo.pt', org_id: 'org-1' },
              error: null,
            }),
          }),
        }),
      };
    }
    if (tabela === 'ti_tickets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { status: statusActual, org_id: 'org-1' },
              error: null,
            }),
          }),
        }),
        update,
      };
    }
    throw new Error(`tabela inesperada: ${tabela}`);
  });

  return update;
}

describe('useMarcarResolvido', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Sem o nome, a lista dizia "Resolvido" e ninguém sabia por quem — que é
  // precisamente a pergunta que se faz quando um pedido volta a abrir.
  it('regista quem deu o pedido por resolvido', async () => {
    const update = mockTransicao('aberto');

    const { result } = renderHook(() => useMarcarResolvido(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ ticketId: 't1' });

    const patch = update.mock.calls[0][0];
    expect(patch.status).toBe('resolvido');
    expect(patch.resolvido_por_nome).toBe('Bruno Paulo');
    expect(patch.resolvido_em).toBeTruthy();
  });
});

describe('useReabrirTicket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Reabrir sem limpar deixava o cartão a dizer "Resolvido por X" num pedido
  // que está outra vez à espera de alguém.
  it('limpa quem tinha resolvido', async () => {
    const update = mockTransicao('resolvido');

    const { result } = renderHook(() => useReabrirTicket(), { wrapper: createWrapper() });
    await result.current.mutateAsync({ ticketId: 't2' });

    const patch = update.mock.calls[0][0];
    expect(patch.status).toBe('nao_resolvido');
    expect(patch.resolvido_por_nome).toBeNull();
    expect(patch.resolvido_em).toBeNull();
  });
});
