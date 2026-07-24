import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { TicketDanosCard } from './TicketDanosCard';
import * as useTicketDanosModule from '@/hooks/useTicketDanos';

function Wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('TicketDanosCard', () => {
  it('não renderiza nada quando o ticket não tem danos ligados', async () => {
    vi.spyOn(useTicketDanosModule, 'useTicketDanos').mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useTicketDanosModule.useTicketDanos>);

    const { container } = render(<TicketDanosCard ticketId="ticket-1" />, { wrapper: Wrapper });
    await waitFor(() => expect(container.firstChild).toBeNull());
  });

  it('mostra os danos ligados com a categoria', async () => {
    vi.spyOn(useTicketDanosModule, 'useTicketDanos').mockReturnValue({
      data: [
        {
          id: 'd1',
          descricao: 'Risco na porta',
          localizacao: 'lateral_esq',
          data_ocorrencia: null,
          created_at: '2026-07-20T10:00:00.000Z',
          categoria: { id: 'cat1', nome: 'Sinistro', cor: '#EC4899' },
          fotos: [],
        },
      ],
      isLoading: false,
    } as unknown as ReturnType<typeof useTicketDanosModule.useTicketDanos>);

    render(<TicketDanosCard ticketId="ticket-1" />, { wrapper: Wrapper });

    expect(await screen.findByText('Risco na porta')).toBeTruthy();
    expect(screen.getByText('Sinistro')).toBeTruthy();
  });
});
