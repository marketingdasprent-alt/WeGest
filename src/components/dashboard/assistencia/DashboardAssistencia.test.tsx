import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DashboardAssistencia } from './DashboardAssistencia';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

// O cabeçalho partilhado é testado a sério em DashboardFrota.test.tsx (com
// QueryClientProvider); aqui só interessa que recebe o perfil certo.
vi.mock('@/components/dashboard/DashboardInicioHeader', () => ({
  DashboardInicioHeader: ({ perfil }: { perfil?: string }) => <div>perfil:{perfil}</div>,
}));

vi.mock('@/hooks/useAssistenciaInicioResumo', () => ({
  useAssistenciaInicioResumo: () => ({
    loading: false,
    kpis: { porResolver: 8, naoAtribuidos: 3, atribuidosAMim: 2, resolvidosHoje: 1 },
    categorias: [
      { id: 'c1', nome: 'Mecanotécnico', cor: '#3B82F6', icone: 'wrench', contagem: 3 },
      { id: 'c2', nome: 'Chapa e pintura', cor: '#F59E0B', icone: 'paint-bucket', contagem: 2 },
    ],
  }),
}));

describe('DashboardAssistencia', () => {
  it('identifica-se ao cabeçalho como o perfil Assistência', async () => {
    render(<DashboardAssistencia />);
    await waitFor(() => expect(screen.getByText(/perfil:Assistência/)).toBeInTheDocument());
  });

  it('mostra os KPIs do topo', async () => {
    render(<DashboardAssistencia />);
    await waitFor(() => expect(screen.getByText('Por resolver')).toBeInTheDocument());
    expect(screen.getByText('Não atribuídos')).toBeInTheDocument();
    expect(screen.getByText('Atribuídos a mim')).toBeInTheDocument();
    expect(screen.getByText('Resolvidos hoje')).toBeInTheDocument();
  });

  it('mostra as categorias com contagem de tickets', async () => {
    render(<DashboardAssistencia />);
    await waitFor(() => expect(screen.getByText('Mecanotécnico')).toBeInTheDocument());
    expect(screen.getByText('3 tickets')).toBeInTheDocument();
  });
});
