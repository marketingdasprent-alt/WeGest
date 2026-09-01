import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { MeusTiTicketsLista } from './MeusTiTicketsLista';
import { supabase } from '@/integrations/supabase/client';

function renderComQueryClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MeusTiTicketsLista />
    </QueryClientProvider>
  );
}

function mockMeusTickets(tickets: unknown[]) {
  (supabase as unknown as { auth: { getUser: unknown } }).auth.getUser = vi
    .fn()
    .mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((tabela: string) => {
    if (tabela === 'ti_tickets') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: tickets, error: null }),
          }),
        }),
      };
    }
    throw new Error(`tabela inesperada: ${tabela}`);
  });
}

describe('MeusTiTicketsLista', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (supabase as unknown as { storage: { from: ReturnType<typeof vi.fn> } }).storage = {
      from: vi.fn(),
    };
  });

  it('mostra mensagem quando não há pedidos próprios', async () => {
    mockMeusTickets([]);
    renderComQueryClient();

    await waitFor(() =>
      expect(screen.getByText('Ainda não submeteste nenhum pedido.')).toBeInTheDocument()
    );
  });

  it('mostra os próprios pedidos sem botões de gestão', async () => {
    mockMeusTickets([
      {
        id: 't1',
        numero: 3,
        autor_nome: 'Bruno Paulo',
        autor_email: 'bruno@exemplo.pt',
        descricao: 'Impressora encravada',
        status: 'com_sugestao',
        created_at: '2026-09-01T10:00:00Z',
        organizacao: null,
        resolvido_por_nome: null,
        resolvido_em: null,
        sugestoes: [
          {
            id: 's1',
            texto: 'Reinicie a impressora',
            util: null,
            resposta_texto: null,
            criado_por_nome: 'Suporte',
            created_at: '2026-09-01T10:05:00Z',
          },
        ],
        anexos: [],
      },
    ]);

    renderComQueryClient();

    await waitFor(() => expect(screen.getByText('Impressora encravada')).toBeInTheDocument());
    expect(screen.getByText('#3')).toBeInTheDocument();
    expect(screen.getByText('Reinicie a impressora')).toBeInTheDocument();
    // Sem acções de gestão — quem vê isto não gere tickets.
    expect(screen.queryByRole('button', { name: 'Marcar como resolvido' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sugerir resolução' })).toBeNull();
  });

  it('mostra e permite abrir os anexos do próprio pedido', async () => {
    mockMeusTickets([
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
        anexos: [
          {
            id: 'a1',
            nome: 'foto.png',
            ficheiro_url: 't1/123-foto.png',
            tamanho_bytes: 100,
            mime_type: 'image/png',
            criado_por_nome: 'Bruno Paulo',
            created_at: '2026-09-01T10:00:00Z',
          },
        ],
      },
    ]);
    const createSignedUrl = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: 'https://exemplo/assinado' }, error: null });
    (supabase.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({ createSignedUrl });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderComQueryClient();

    await waitFor(() => expect(screen.getByText('foto.png')).toBeInTheDocument());
    fireEvent.click(screen.getByText('foto.png'));

    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        'https://exemplo/assinado',
        '_blank',
        'noopener,noreferrer'
      )
    );
  });
});
