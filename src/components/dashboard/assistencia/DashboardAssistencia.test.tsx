import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardAssistencia } from './DashboardAssistencia';
import { supabase } from '@/integrations/supabase/client';
import { useViaturasNaOficina } from '@/hooks/useViaturasNaOficina';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

// A secção "Viaturas em oficina" reaproveita o hook useViaturasNaOficina em
// vez de uma query própria (ver DashboardAssistencia.tsx) — mock-a-se aqui
// da mesma forma que qualquer outro hook importado.
vi.mock('@/hooks/useViaturasNaOficina', () => ({
  useViaturasNaOficina: vi.fn(),
}));

function mockFrom(porTabela: Record<string, any>) {
  vi.mocked(supabase.from).mockImplementation((tabela: string) => {
    const resultado = porTabela[tabela] ?? { data: [], error: null };
    const builder: any = {
      select: vi.fn(() => builder),
      is: vi.fn(() => builder),
      in: vi.fn(() => builder),
      not: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      order: vi.fn(() => Promise.resolve(resultado)),
      then: (resolve: any) => Promise.resolve(resultado).then(resolve),
    };
    return builder;
  });
}

function renderComponent() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardAssistencia />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('DashboardAssistencia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Por omissão, o hook não devolve nenhuma viatura na oficina — os testes
    // que precisam de dados sobrescrevem isto explicitamente.
    vi.mocked(useViaturasNaOficina).mockReturnValue({
      data: [],
      isLoading: false,
    } as any);
  });

  it('mostra a contagem de tickets abertos', async () => {
    mockFrom({
      assistencia_tickets: {
        data: [
          { id: '1', numero: 10, titulo: 'Pneu furado', status: 'aberto', created_at: '2026-09-01', viatura_id: 'v1' },
          { id: '2', numero: 11, titulo: 'Revisao', status: 'em_andamento', created_at: '2026-09-02', viatura_id: 'v2' },
        ],
        error: null,
      },
      viaturas: { data: [], error: null },
    });

    renderComponent();

    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
  });

  it('mostra as viaturas na oficina devolvidas pelo useViaturasNaOficina', async () => {
    mockFrom({
      assistencia_tickets: { data: [], error: null },
      viaturas: { data: [], error: null },
    });
    vi.mocked(useViaturasNaOficina).mockReturnValue({
      data: [
        {
          id: 'r1',
          viatura_id: 'v1',
          matricula: 'AA-11-BB',
          marca: 'Renault',
          modelo: 'Clio',
          descricao: null,
          oficina: null,
          data_entrada: '2026-08-20',
          km_entrada: null,
        },
      ],
      isLoading: false,
    } as any);

    renderComponent();

    await waitFor(() => expect(screen.getByText('AA-11-BB')).toBeInTheDocument());
  });

  it('mostra a contagem de extintores a expirar', async () => {
    mockFrom({
      assistencia_tickets: { data: [], error: null },
      viaturas: {
        data: [{ id: 'v1', matricula: 'AA-11-BB', extintor_validade: '2026-09-10' }],
        error: null,
      },
    });

    renderComponent();

    // Sem tickets e sem viaturas na oficina, "1" só pode ser a contagem de
    // extintores a expirar.
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
  });
});
