import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ViaturaStatsCards } from './ViaturaStatsCards';

const STATS = {
  total: 289,
  disponiveis: 33,
  emUso: 181,
  alugadas: 168,
  manutencao: 9,
  inativas: 66,
  vendidas: 0,
};

describe('ViaturaStatsCards', () => {
  it('por omissão mostra os seis cartões, com Inativas', () => {
    render(<ViaturaStatsCards stats={STATS} />);
    expect(screen.getByText('Inativas')).not.toBeNull();
    expect(
      screen.getAllByText(/^(Total de Viaturas|Disponíveis|Em Uso|Alugadas|Manutenção|Inativas)$/)
    ).toHaveLength(6);
  });

  it('semInativas (âmbito TVDE) tira só o cartão Inativas', () => {
    render(<ViaturaStatsCards stats={STATS} semInativas />);
    expect(screen.queryByText('Inativas')).toBeNull();
    expect(screen.getByText('Disponíveis')).not.toBeNull();
    expect(screen.getByText('Manutenção')).not.toBeNull();
  });

  it('cartões extra (o SLOT) entram na mesma grelha, a seguir aos estados', () => {
    const { container } = render(
      <ViaturaStatsCards stats={STATS} semInativas>
        <div>SLOT extra</div>
      </ViaturaStatsCards>
    );
    const grelha = container.firstElementChild;
    expect(grelha?.children).toHaveLength(6);
    expect(grelha?.lastElementChild?.textContent).toBe('SLOT extra');
  });
});
