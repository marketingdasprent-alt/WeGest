import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DashboardAssistencia } from './DashboardAssistencia';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
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

describe('DashboardAssistencia', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra a contagem de tickets abertos', async () => {
    mockFrom({
      assistencia_tickets: {
        data: [
          { id: '1', numero: 10, titulo: 'Pneu furado', status: 'aberto', created_at: '2026-09-01', viatura_id: 'v1' },
          { id: '2', numero: 11, titulo: 'Revisao', status: 'em_andamento', created_at: '2026-09-02', viatura_id: 'v2' },
        ],
        error: null,
      },
      viatura_reparacoes: { data: [], error: null },
      viaturas: { data: [], error: null },
    });

    render(
      <MemoryRouter>
        <DashboardAssistencia />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument());
  });
});
