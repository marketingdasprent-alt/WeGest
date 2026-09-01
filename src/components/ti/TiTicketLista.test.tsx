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

  it('a pesquisa filtra por número, nome do autor e texto da descrição', async () => {
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
        anexos: [],
      },
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
    await waitFor(() => expect(screen.getByText('Pedidos actuais (2)')).toBeInTheDocument());

    const campo = screen.getByLabelText('Pesquisar pedidos');

    fireEvent.change(campo, { target: { value: 'impressora' } });
    await waitFor(() => expect(screen.getByText('Pedidos actuais (1)')).toBeInTheDocument());
    expect(screen.getByText('Impressora encravada')).toBeInTheDocument();
    expect(screen.queryByText('O portátil não liga')).toBeNull();

    fireEvent.change(campo, { target: { value: 'bruno' } });
    await waitFor(() => expect(screen.getByText('O portátil não liga')).toBeInTheDocument());

    fireEvent.change(campo, { target: { value: '2' } });
    await waitFor(() => expect(screen.getByText('Impressora encravada')).toBeInTheDocument());

    fireEvent.change(campo, { target: { value: 'nada-a-ver' } });
    await waitFor(() =>
      expect(screen.getByText('Nenhum pedido corresponde à pesquisa.')).toBeInTheDocument()
    );
  });

  it('pagina a lista de 5 em 5 e muda de página ao clicar', async () => {
    const tickets = Array.from({ length: 7 }, (_, i) => ({
      id: `t${i + 1}`,
      numero: i + 1,
      autor_nome: `Autor ${i + 1}`,
      autor_email: `autor${i + 1}@exemplo.pt`,
      descricao: `Pedido número ${i + 1}`,
      status: 'aberto',
      created_at: '2026-09-01T10:00:00Z',
      organizacao: null,
      resolvido_por_nome: null,
      resolvido_em: null,
      sugestoes: [],
      anexos: [],
    }));
    mockTickets(tickets);

    renderComQueryClient();
    await waitFor(() => expect(screen.getByText('Pedidos actuais (7)')).toBeInTheDocument());

    // Página 1: os 5 mais recentes (numero 1 a 5, na ordem devolvida).
    expect(screen.getByText('Pedido número 1')).toBeInTheDocument();
    expect(screen.getByText('Pedido número 5')).toBeInTheDocument();
    expect(screen.queryByText('Pedido número 6')).toBeNull();

    // PaginationLink renderiza um <a> sem href, que não tem role="link"
    // implícito — por isso o texto, não o role.
    fireEvent.click(screen.getByText('2'));

    await waitFor(() => expect(screen.getByText('Pedido número 6')).toBeInTheDocument());
    expect(screen.getByText('Pedido número 7')).toBeInTheDocument();
    expect(screen.queryByText('Pedido número 1')).toBeNull();
  });

  it('não mostra paginação quando cabe tudo numa página só', async () => {
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
        anexos: [],
      },
    ]);

    renderComQueryClient();

    await waitFor(() => expect(screen.getByText('O portátil não liga')).toBeInTheDocument());
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
