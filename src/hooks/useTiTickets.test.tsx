import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { abrirTiAnexo, useMarcarResolvido, useReabrirTicket } from './useTiTickets';
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
