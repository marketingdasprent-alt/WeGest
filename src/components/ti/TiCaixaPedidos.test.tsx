import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { TiCaixaPedidos } from './TiCaixaPedidos';
import * as ticketsModule from '@/hooks/useTiTickets';
import * as conversaModule from '@/hooks/useTiTicketConversa';
import type { TiTicket } from '@/hooks/useTiTickets';

function pedido(parcial: Partial<TiTicket>): TiTicket {
  return {
    id: 't1',
    numero: 31,
    autor_nome: 'Franciele Silva',
    autor_email: 'franciele@exemplo.pt',
    descricao: 'Acrescentar estados de sinistro',
    status: 'aberto',
    criado_por: 'u-franciele',
    created_at: '2026-10-21T11:41:00Z',
    updated_at: '2026-10-21T11:41:00Z',
    organizacao: { nome: 'Década Ousada' },
    resolvido_por_nome: null,
    resolvido_em: null,
    mensagens: [],
    anexos: [],
    ...parcial,
  };
}

function montar(gestao: boolean, tickets: TiTicket[], url = '/ti/tok') {
  const resultado = { data: tickets, isLoading: false, error: null };
  vi.spyOn(ticketsModule, 'useTiTickets').mockReturnValue(
    resultado as unknown as ReturnType<typeof ticketsModule.useTiTickets>
  );
  vi.spyOn(ticketsModule, 'useMeusTiTickets').mockReturnValue(
    resultado as unknown as ReturnType<typeof ticketsModule.useMeusTiTickets>
  );
  vi.spyOn(conversaModule, 'useTiTicketsTempoReal').mockImplementation(() => {});
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <TiCaixaPedidos gestao={gestao} uid="u-suporte" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('TiCaixaPedidos', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('quem gere abre um pedido e vê a conversa com as acções de estado', () => {
    montar(true, [pedido({})]);

    expect(screen.getByText('1 à espera de resposta')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Franciele Silva/ }));

    expect(screen.getByText('Pedido #31')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resolvido/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Mensagem')).toHaveAttribute(
      'placeholder',
      'Responder a Franciele Silva…'
    );
  });

  it('quem pediu vê a conversa sem acções de estado nem separador "Por responder"', () => {
    montar(false, [pedido({})], '/ti/tok?pedido=t1');

    expect(screen.getByText('Pedido #31')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Por responder/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Resolvido/ })).toBeNull();
    expect(screen.getByLabelText('Mensagem')).toBeInTheDocument();
  });

  it('pedido resolvido fecha a caixa de escrita e oferece reabrir a quem gere', () => {
    montar(
      true,
      [pedido({ status: 'resolvido', resolvido_por_nome: 'João' })],
      '/ti/tok?pedido=t1'
    );

    expect(screen.queryByLabelText('Mensagem')).toBeNull();
    expect(screen.getByRole('button', { name: /Reabrir/ })).toBeInTheDocument();
    expect(screen.getByText(/Reabra-o para continuar/)).toBeInTheDocument();
  });

  it('largar um ficheiro em cima da conversa anexa-o à mensagem', () => {
    montar(true, [pedido({})], '/ti/tok?pedido=t1');
    const conversa = screen.getByText('Pedido #31').closest('.relative') as HTMLElement;
    const pdf = new File(['x'], 'erro.pdf', { type: 'application/pdf' });
    const dataTransfer = { files: [pdf], types: ['Files'] };

    fireEvent.dragEnter(conversa, { dataTransfer });
    expect(screen.getByText('Largue aqui para anexar')).toBeInTheDocument();
    fireEvent.drop(conversa, { dataTransfer });

    expect(screen.queryByText('Largue aqui para anexar')).toBeNull();
    expect(screen.getByText('erro.pdf')).toBeInTheDocument();
  });
});
