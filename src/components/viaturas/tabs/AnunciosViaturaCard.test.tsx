import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AnunciosViaturaCard } from './AnunciosViaturaCard';
import { supabase } from '@/integrations/supabase/client';

function renderComQueryClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// jsdom não implementa scrollIntoView; o Select (Radix) chama-o ao abrir.
Element.prototype.scrollIntoView = vi.fn();

describe('AnunciosViaturaCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('não renderiza nada sem viaturaId (viatura ainda não gravada)', () => {
    const { container } = renderComQueryClient(<AnunciosViaturaCard viaturaId={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('sem anúncio atribuído e ligado, mostra o seletor de por atribuir', async () => {
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((tabela: string) => {
      if (tabela === 'viaturas') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { elegivel_anuncios: true }, error: null }),
            }),
          }),
        };
      }
      if (tabela === 'cliente_anuncios') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols.includes('clientes!inner')) {
              return {
                is: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: 'a1',
                          preco: 50,
                          data_inicio: '2026-09-01',
                          data_fim: '2026-09-30',
                          clientes: { nome: 'Empresa X' },
                        },
                      ],
                      error: null,
                    }),
                  }),
                }),
              };
            }
            return {
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            };
          }),
        };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    });

    renderComQueryClient(<AnunciosViaturaCard viaturaId="v1" />);

    // As opções do Select só existem no DOM depois de aberto — o portal do
    // Radix não as renderiza antes disso.
    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
    fireEvent.click(screen.getByRole('combobox'));

    await waitFor(() =>
      expect(
        screen.getByText(/Empresa X — 50,00 € — 01\/09\/2026 a 30\/09\/2026/)
      ).toBeInTheDocument()
    );
  });
});
