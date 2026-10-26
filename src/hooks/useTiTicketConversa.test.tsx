import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { useEnviarTiMensagem } from './useTiTicketConversa';
import { normalizarTickets } from './useTiTickets';
import { supabase } from '@/integrations/supabase/client';

const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('useEnviarTiMensagem', () => {
  beforeEach(() => vi.clearAllMocks());

  it('com sessão, envia o id do pedido (o servidor decide o lado)', async () => {
    invoke.mockResolvedValue({ data: { success: true, anexosFalhou: false }, error: null });
    const { result } = renderHook(() => useEnviarTiMensagem(), { wrapper: createWrapper() });

    await result.current.mutateAsync({ ticketId: 't1', texto: 'Olá', ficheiros: [] });

    expect(invoke).toHaveBeenCalledWith('ti-ticket-mensagem', {
      body: { ticket_id: 't1', texto: 'Olá', anexos: [] },
    });
  });

  it('o token do link tem prioridade sobre o id', async () => {
    invoke.mockResolvedValue({ data: { success: true }, error: null });
    const { result } = renderHook(() => useEnviarTiMensagem(), { wrapper: createWrapper() });

    await result.current.mutateAsync({
      ticketId: 't1',
      acessoToken: 'acc',
      texto: 'Olá',
      ficheiros: [],
    });

    expect(invoke.mock.calls[0][1].body).toEqual({ acesso_token: 'acc', texto: 'Olá', anexos: [] });
  });

  it('a mensagem do servidor chega a quem chamou (ex.: pedido resolvido)', async () => {
    const resposta = new Response(JSON.stringify({ error: 'Este pedido está resolvido.' }), {
      status: 409,
    });
    invoke.mockResolvedValue({ data: null, error: { context: resposta } });
    const { result } = renderHook(() => useEnviarTiMensagem(), { wrapper: createWrapper() });

    await expect(
      result.current.mutateAsync({ ticketId: 't1', texto: 'Olá', ficheiros: [] })
    ).rejects.toThrow('Este pedido está resolvido.');
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('normalizarTickets', () => {
  it('esconde mensagens apagadas (e os anexos delas) e ordena por data', () => {
    const [t] = normalizarTickets([
      {
        id: 't1',
        mensagens: [
          { id: 'm2', created_at: '2026-10-02T00:00:00Z', deleted_at: null },
          { id: 'm0', created_at: '2026-10-01T00:00:00Z', deleted_at: '2026-10-03T00:00:00Z' },
          { id: 'm1', created_at: '2026-10-01T00:00:00Z', deleted_at: null },
        ],
        anexos: [
          { id: 'a2', mensagem_id: 'm2', created_at: '2026-10-02T00:00:00Z' },
          { id: 'a1', mensagem_id: null, created_at: '2026-10-01T00:00:00Z' },
          { id: 'a0', mensagem_id: 'm0', created_at: '2026-10-01T00:00:00Z' },
        ],
      },
    ] as unknown as Parameters<typeof normalizarTickets>[0]);

    expect(t.mensagens.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(t.mensagens[0]).not.toHaveProperty('deleted_at');
    expect(t.anexos.map((a) => a.id)).toEqual(['a1', 'a2']);
  });
});
