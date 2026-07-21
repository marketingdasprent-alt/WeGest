import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const semanas = [
  {
    id: 'r1',
    semanaInicio: '2026-07-06',
    semanaFim: '2026-07-12',
    receitaAluguer: 300,
    receitaOutros: 0,
    despesaCombustivel: 0,
    despesaPortagens: 0,
    despesaDanos: 20,
    despesaOutros: 15, // multas
    receitaTotal: 300,
    despesaTotal: 35,
    saldo: 265,
  },
];

vi.mock('@/hooks/useViaturaResumoSemanal', () => ({
  useViaturaResumoSemanal: vi.fn(() => ({ semanas, loading: false })),
}));

import { ViaturaFinanceiraSemanal } from './ViaturaFinanceiraSemanal';
import { useViaturaResumoSemanal } from '@/hooks/useViaturaResumoSemanal';

describe('ViaturaFinanceiraSemanal', () => {
  it('mostra a semana com receita, despesa e saldo', () => {
    render(<ViaturaFinanceiraSemanal viaturaId="v1" />);
    expect(screen.getByText('06/07 - 12/07')).toBeInTheDocument();
    expect(screen.getByText('€300,00')).toBeInTheDocument();
    expect(screen.getByText('€35,00')).toBeInTheDocument();
    expect(screen.getByText('€265,00')).toBeInTheDocument();
  });

  it('detalhe mostra só Aluguer/Multas/Danos, sem combustível/portagens/outras receitas', () => {
    render(<ViaturaFinanceiraSemanal viaturaId="v1" />);
    fireEvent.click(screen.getByText('06/07 - 12/07'));
    expect(screen.getByText('Aluguer (contrato)')).toBeInTheDocument();
    expect(screen.getByText('Multas')).toBeInTheDocument();
    expect(screen.getByText('Danos')).toBeInTheDocument();
    expect(screen.getByText('€15,00')).toBeInTheDocument(); // multas
    expect(screen.getByText('€20,00')).toBeInTheDocument(); // danos
    expect(screen.queryByText('Combustível')).not.toBeInTheDocument();
    expect(screen.queryByText('Portagens')).not.toBeInTheDocument();
    expect(screen.queryByText('Outras receitas')).not.toBeInTheDocument();
  });

  it('mostra estado vazio sem semanas geradas', () => {
    vi.mocked(useViaturaResumoSemanal).mockReturnValueOnce({ semanas: [], loading: false });
    render(<ViaturaFinanceiraSemanal viaturaId="v2" />);
    expect(screen.getByText(/começa a ser gerado/i)).toBeInTheDocument();
  });
});
