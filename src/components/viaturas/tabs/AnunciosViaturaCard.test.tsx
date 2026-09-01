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

  it('com anúncio já atribuído, mostra a faixa em vez do seletor', async () => {
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
                    order: vi.fn().mockResolvedValue({ data: [], error: null }),
                  }),
                }),
              };
            }
            return {
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'a1',
                    cliente_id: 'c1',
                    viatura_id: 'v1',
                    preco: 50,
                    data_inicio: '2026-09-01',
                    data_fim: '2026-09-30',
                    created_at: '2026-08-31T10:00:00Z',
                    clientes: { nome: 'Empresa X' },
                  },
                  error: null,
                }),
              }),
            };
          }),
        };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    });

    renderComQueryClient(<AnunciosViaturaCard viaturaId="v1" />);

    await waitFor(() => expect(screen.getByText('Empresa X')).toBeInTheDocument());
    expect(screen.getByText('€50,00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desatribuir' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  // Regressão: valorEscolhido só era limpo no onError da atribuição — não no
  // sucesso nem ao desatribuir. Depois de atribuir e desatribuir o mesmo
  // anúncio, o Select remontado ficava com o valor antigo "selecionado" e
  // reescolher o mesmo anúncio não disparava onValueChange (Radix não
  // reemite para um valor já seleccionado), deixando o Select preso.
  it('atribuir, desatribuir e voltar a escolher o mesmo anúncio não deixa o Select preso', async () => {
    let atribuido = false;

    const linhaPorAtribuir = {
      id: 'a1',
      preco: 50,
      data_inicio: '2026-09-01',
      data_fim: '2026-09-30',
      clientes: { nome: 'Empresa X' },
    };

    const linhaDaViatura = {
      id: 'a1',
      cliente_id: 'c1',
      viatura_id: 'v1',
      preco: 50,
      data_inicio: '2026-09-01',
      data_fim: '2026-09-30',
      created_at: '2026-08-31T10:00:00Z',
      clientes: { nome: 'Empresa X' },
    };

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
                    order: vi.fn().mockImplementation(() =>
                      Promise.resolve({
                        data: atribuido ? [] : [linhaPorAtribuir],
                        error: null,
                      })
                    ),
                  }),
                }),
              };
            }
            return {
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi
                  .fn()
                  .mockImplementation(() =>
                    Promise.resolve({ data: atribuido ? linhaDaViatura : null, error: null })
                  ),
              }),
            };
          }),
          update: vi.fn().mockImplementation((payload: { viatura_id: string | null }) => {
            if (payload.viatura_id === null) {
              atribuido = false;
              return { eq: vi.fn().mockResolvedValue({ error: null }) };
            }
            atribuido = true;
            return {
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  select: vi.fn().mockResolvedValue({ data: [{ id: 'a1' }], error: null }),
                }),
              }),
            };
          }),
        };
      }
      throw new Error(`tabela inesperada: ${tabela}`);
    });

    renderComQueryClient(<AnunciosViaturaCard viaturaId="v1" />);

    // 1. Atribuir o anúncio A pela primeira vez.
    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByText(/Empresa X — 50,00 €/));

    await waitFor(() => expect(screen.getByText('Empresa X')).toBeInTheDocument());
    expect(screen.queryByRole('combobox')).toBeNull();

    // 2. Desatribuir — o Select remonta.
    fireEvent.click(screen.getByRole('button', { name: 'Desatribuir' }));
    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());

    // 3. Voltar a escolher o MESMO anúncio tem de voltar a atribuir — se
    // valorEscolhido tivesse ficado preso em 'a1', este clique não faria nada.
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByText(/Empresa X — 50,00 €/));

    await waitFor(() => expect(screen.getByText('Empresa X')).toBeInTheDocument());
    expect(screen.queryByRole('combobox')).toBeNull();
  });
});
