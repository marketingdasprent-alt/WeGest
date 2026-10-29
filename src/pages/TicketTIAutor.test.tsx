import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import TicketTIAutor from './TicketTIAutor';
import { supabase } from '@/integrations/supabase/client';

const invoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

const TICKET = {
  numero: 5,
  autor_nome: 'Bruno Paulo',
  descricao: 'O portátil não liga',
  status: 'aberto',
  created_at: '2026-09-01T14:07:00Z',
  resolvido_por_nome: null,
  resolvido_em: null,
};

function renderComToken(dados: unknown) {
  invoke.mockImplementation(async (nome: string) =>
    nome === 'ti-ticket-por-token'
      ? { data: dados, error: null }
      : { data: { success: true, anexosFalhou: false }, error: null }
  );
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/ti-autor/tok-1']}>
        <Routes>
          <Route path="/ti-autor/:acessoToken" element={<TicketTIAutor />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('TicketTIAutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra o pedido inicial e a conversa, pela ordem', async () => {
    renderComToken({
      success: true,
      ticket: TICKET,
      mensagens: [
        {
          id: 'm1',
          autor_tipo: 'suporte',
          criado_por_nome: 'Ana Suporte',
          texto: 'Já experimentou carregar a bateria?',
          created_at: '2026-09-01T15:00:00Z',
        },
      ],
      anexos: [],
    });

    await waitFor(() => expect(screen.getByText('Pedido #5')).toBeInTheDocument());
    expect(screen.getByText('O portátil não liga')).toBeInTheDocument();
    expect(screen.getByText('Já experimentou carregar a bateria?')).toBeInTheDocument();
    expect(screen.getByText('Ana Suporte')).toBeInTheDocument();
  });

  it('envia a resposta com o token do link', async () => {
    renderComToken({ success: true, ticket: TICKET, mensagens: [], anexos: [] });

    const caixa = await screen.findByLabelText('Mensagem');
    fireEvent.change(caixa, { target: { value: 'Continua sem ligar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('ti-ticket-mensagem', {
        body: { acesso_token: 'tok-1', texto: 'Continua sem ligar', anexos: [] },
      })
    );
  });

  it('pedido resolvido: mostra quem resolveu e fecha a caixa de escrita', async () => {
    renderComToken({
      success: true,
      ticket: {
        ...TICKET,
        status: 'resolvido',
        resolvido_por_nome: 'Ana Suporte',
        resolvido_em: '2026-09-02T10:00:00Z',
      },
      mensagens: [],
      anexos: [],
    });

    await waitFor(() => expect(screen.getByText(/Resolvido por/)).toBeInTheDocument());
    expect(screen.queryByLabelText('Mensagem')).toBeNull();
  });

  it('link inválido mostra o erro do servidor, não um pedido vazio', async () => {
    renderComToken({ success: false, error: 'Ticket não encontrado.' });
    await waitFor(() => expect(screen.getByText('Ticket não encontrado.')).toBeInTheDocument());
  });
});
