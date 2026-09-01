import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { TiTicketLista } from './TiTicketLista';
import { supabase } from '@/integrations/supabase/client';

function renderComQueryClient() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TiTicketLista />
    </QueryClientProvider>
  );
}

function mockTickets(tickets: unknown[]) {
  (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((tabela: string) => {
    if (tabela === 'ti_tickets') {
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: tickets, error: null }),
        }),
      };
    }
    throw new Error(`tabela inesperada: ${tabela}`);
  });
}

describe('TiTicketLista', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (supabase as unknown as { storage: { from: ReturnType<typeof vi.fn> } }).storage = {
      from: vi.fn(),
    };
  });

  // O formulário público (sempre visível na página) já cobre isto — o botão
  // duplicava a forma de abrir um pedido, e o hook que o suportava saiu.
  it('não mostra o botão "Novo pedido"', async () => {
    mockTickets([]);
    renderComQueryClient();

    await waitFor(() => expect(screen.getByText('Pedidos actuais (0)')).toBeInTheDocument());
    expect(screen.queryByText('Novo pedido')).toBeNull();
  });

  it('mostra os anexos de um pedido e abre a URL assinada ao clicar', async () => {
    mockTickets([
      {
        id: 't1',
        numero: 1,
        autor_nome: 'Bruno Paulo',
        autor_email: 'bruno@exemplo.pt',
        descricao: 'O portátil não liga',
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
    expect(supabase.storage.from).toHaveBeenCalledWith('ti-ticket-anexos');
    expect(createSignedUrl).toHaveBeenCalledWith('t1/123-foto.png', 600);
  });

  it('não mostra nenhum anexo quando o pedido não tem', async () => {
    mockTickets([
      {
        id: 't2',
        numero: 2,
        autor_nome: 'Márcia Gil',
        autor_email: 'marcia@exemplo.pt',
        descricao: 'Impressora encravada',
        status: 'aberto',
        created_at: '2026-09-01T10:00:00Z',
        organizacao: null,
        resolvido_por_nome: null,
        resolvido_em: null,
        sugestoes: [],
        anexos: [],
      },
    ]);

    renderComQueryClient();

    await waitFor(() => expect(screen.getByText('Impressora encravada')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /\.png|\.pdf/ })).toBeNull();
  });
});
