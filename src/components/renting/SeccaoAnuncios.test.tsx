import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { SeccaoAnuncios } from './SeccaoAnuncios';
import { supabase } from '@/integrations/supabase/client';

function renderComQueryClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function mockElegivel(elegivel: boolean) {
  (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((tabela: string) => {
    if (tabela === 'clientes') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi
              .fn()
              .mockResolvedValue({ data: { elegivel_anuncios: elegivel }, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      };
    }
    if (tabela === 'cliente_anuncios') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      };
    }
    throw new Error(`tabela inesperada: ${tabela}`);
  });
}

describe('SeccaoAnuncios', () => {
  beforeEach(() => vi.clearAllMocks());

  it('com o toggle desligado, não mostra a lista', async () => {
    mockElegivel(false);
    renderComQueryClient(<SeccaoAnuncios clienteId="c1" />);

    await waitFor(() => expect(screen.getByRole('switch')).not.toBeChecked());
    expect(screen.queryByText('Adicionar anúncio')).toBeNull();
  });

  it('com o toggle ligado, mostra o botão de adicionar', async () => {
    mockElegivel(true);
    renderComQueryClient(<SeccaoAnuncios clienteId="c1" />);

    await waitFor(() => expect(screen.getByRole('switch')).toBeChecked());
    expect(screen.getByText('Adicionar anúncio')).toBeInTheDocument();
  });

  it('ligar o toggle chama a mutação de elegibilidade', async () => {
    mockElegivel(false);
    renderComQueryClient(<SeccaoAnuncios clienteId="c1" />);

    await waitFor(() => expect(screen.getByRole('switch')).not.toBeChecked());
    fireEvent.click(screen.getByRole('switch'));

    await waitFor(() => {
      const chamadaUpdate = (supabase.from as ReturnType<typeof vi.fn>).mock.results.find(
        (r) => r.value.update
      );
      expect(chamadaUpdate).toBeTruthy();
    });
  });

  // O preço e as datas são editáveis depois de criados — não só no momento
  // em que o anúncio nasce.
  it('uma linha existente entra em edição e grava o preço novo', async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    (supabase.from as ReturnType<typeof vi.fn>).mockImplementation((tabela: string) => {
      if (tabela === 'clientes') {
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
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'a1',
                    cliente_id: 'c1',
                    viatura_id: null,
                    preco: 50,
                    data_inicio: '2026-09-01',
                    data_fim: '2026-09-30',
                    created_at: '2026-08-31T10:00:00Z',
                    viaturas: null,
                  },
                ],
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: updateEq }),
        };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    });

    renderComQueryClient(<SeccaoAnuncios clienteId="c1" />);

    await waitFor(() => expect(screen.getByText('50.00 €')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));

    const campoPreco = screen.getByLabelText('Preço (€)') as HTMLInputElement;
    fireEvent.change(campoPreco, { target: { value: '75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(updateEq).toHaveBeenCalledWith('id', 'a1'));
  });
});
