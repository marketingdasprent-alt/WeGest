import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  abrirTiAnexo,
  useMarcarResolvido,
  useMeusTiTickets,
  useReabrirTicket,
} from './useTiTickets';
import { supabase } from '@/integrations/supabase/client';

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('abrirTiAnexo', () => {
  // O mock partilhado de src/__tests__/setup.ts não inclui `storage` (só
  // `from`, `rpc`, `auth`, `functions`) — nenhum outro teste ainda o tinha
  // usado. Mesmo padrão já usado neste ficheiro para `auth.getUser`: aumenta
  // o mock localmente em vez de mexer no partilhado.
  beforeEach(() => {
    vi.clearAllMocks();
    (supabase as unknown as { storage: { from: ReturnType<typeof vi.fn> } }).storage = {
      from: vi.fn(),
    };
  });

  it('devolve a URL assinada quando o storage responde bem', async () => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'https://exemplo/assinado' }, error: null });
    (supabase.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({ createSignedUrl });

    const url = await abrirTiAnexo('ticket-1/123-foto.png');

    expect(url).toBe('https://exemplo/assinado');
    expect(supabase.storage.from).toHaveBeenCalledWith('ti-ticket-anexos');
    expect(createSignedUrl).toHaveBeenCalledWith('ticket-1/123-foto.png', 600);
  });

  // A RLS recusa (empresa errada) ou o ficheiro já não existe — nos dois casos
  // o storage devolve um erro, e quem chama não deve rebentar por causa disso.
  it('devolve null quando o storage recusa ou falha', async () => {
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('não autorizado') });
    (supabase.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({ createSignedUrl });

    const url = await abrirTiAnexo('ticket-1/123-foto.png');

    expect(url).toBeNull();
  });
});

describe('useMeusTiTickets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devolve lista vazia sem rebentar quando não há sessão', async () => {
    (supabase as unknown as { auth: { getUser: unknown } }).auth.getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: null }, error: null });

    const { result } = renderHook(() => useMeusTiTickets(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    // Sem sessão, nem vale a pena perguntar à BD — não há utilizador para filtrar.
    expect(supabase.from).not.toHaveBeenCalled();
  });

  // O `.eq('criado_por', uid)` é a segunda camada de garantia (a RLS já
  // limita, mas explicitar aqui evita depender só dela).
  it('filtra os pedidos por criado_por do utilizador da sessão', async () => {
    (supabase as unknown as { auth: { getUser: unknown } }).auth.getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });

    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: 't1',
          numero: 3,
          autor_nome: 'Bruno Paulo',
          autor_email: 'bruno@exemplo.pt',
          descricao: 'Impressora encravada',
          status: 'aberto',
          created_at: '2026-09-01T10:00:00Z',
          organizacao: null,
          resolvido_por_nome: null,
          resolvido_em: null,
          sugestoes: [],
          anexos: [],
        },
      ],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ select });

    const { result } = renderHook(() => useMeusTiTickets(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(supabase.from).toHaveBeenCalledWith('ti_tickets');
    expect(eq).toHaveBeenCalledWith('criado_por', 'u1');
    expect(result.current.data?.[0].numero).toBe(3);
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
