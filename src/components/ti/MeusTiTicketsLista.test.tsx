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

  it('pagina os próprios pedidos de 5 em 5', async () => {
    const tickets = Array.from({ length: 7 }, (_, i) => ({
      id: `t${i + 1}`,
      numero: i + 1,
      autor_nome: 'Bruno Paulo',
      autor_email: 'bruno@exemplo.pt',
      descricao: `Pedido número ${i + 1}`,
      status: 'aberto',
      created_at: '2026-09-01T10:00:00Z',
      organizacao: null,
      resolvido_por_nome: null,
      resolvido_em: null,
      sugestoes: [],
      anexos: [],
    }));
    mockMeusTickets(tickets);

    renderComQueryClient();
    await waitFor(() => expect(screen.getByText('Os meus pedidos (7)')).toBeInTheDocument());

    expect(screen.getByText('Pedido número 1')).toBeInTheDocument();
    expect(screen.queryByText('Pedido número 6')).toBeNull();

    fireEvent.click(screen.getByText('2'));

    await waitFor(() => expect(screen.getByText('Pedido número 6')).toBeInTheDocument());
    expect(screen.queryByText('Pedido número 1')).toBeNull();
  });

  it('mostra a hora, não só a data, de quando o pedido foi resolvido', async () => {
    mockMeusTickets([
      {
        id: 't1',
        numero: 3,
        autor_nome: 'Bruno Paulo',
        autor_email: 'bruno@exemplo.pt',
        descricao: 'Impressora encravada',
        status: 'resolvido',
        created_at: '2026-09-01T09:00:00Z',
        organizacao: null,
        resolvido_por_nome: 'Dinis Silva',
        resolvido_em: '2026-09-01T15:45:00Z',
        sugestoes: [],
        anexos: [],
      },
    ]);

    renderComQueryClient();

    await waitFor(() => expect(screen.getByText('Dinis Silva')).toBeInTheDocument());
    const paragrafo = screen.getByText('Dinis Silva').closest('p');
    expect(paragrafo?.textContent).toMatch(
      /^Resolvido por Dinis Silva a \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/
    );
  });

  it('mostra a data e hora de quando a sugestão foi respondida', async () => {
    mockMeusTickets([
      {
        id: 't1',
        numero: 3,
        autor_nome: 'Bruno Paulo',
        autor_email: 'bruno@exemplo.pt',
        descricao: 'Impressora encravada',
        status: 'com_sugestao',
        created_at: '2026-09-01T09:00:00Z',
        organizacao: null,
        resolvido_por_nome: null,
        resolvido_em: null,
        sugestoes: [
          {
            id: 's1',
            texto: 'Reinicie a impressora',
            util: true,
            resposta_texto: null,
            criado_por_nome: 'Suporte',
            created_at: '2026-09-01T09:30:00Z',
            respondida_em: '2026-09-01T10:15:00Z',
          },
        ],
        anexos: [],
      },
    ]);

    renderComQueryClient();

    await waitFor(() => expect(screen.getByText('Marcaste: resolveu')).toBeInTheDocument());
    expect(screen.getByText(/^· \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/)).toBeInTheDocument();
  });
});
