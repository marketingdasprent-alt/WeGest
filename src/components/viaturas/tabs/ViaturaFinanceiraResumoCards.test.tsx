import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ViaturaFinanceiraResumoCards } from './ViaturaFinanceiraResumoCards';

describe('ViaturaFinanceiraResumoCards', () => {
  it('mostra N/A na Rentabilidade quando não há Custo Aquisição (rentabilidadePerc null)', () => {
    render(
      <ViaturaFinanceiraResumoCards
        totalAquisicaoVal={0}
        restanteMeses="12"
        totalReceitasVal={830}
        totalDespesasVal={122.5}
        rentabilidadePerc={null}
      />
    );
    expect(screen.getByText('N/A')).toBeInTheDocument();
    expect(screen.getByText(/sem custo aquisição configurado/i)).toBeInTheDocument();
  });

  it('mostra percentagem quando há Custo Aquisição', () => {
    render(
      <ViaturaFinanceiraResumoCards
        totalAquisicaoVal={10000}
        restanteMeses="N/A"
        totalReceitasVal={830}
        totalDespesasVal={122.5}
        rentabilidadePerc={7.5}
      />
    );
    expect(screen.getByText('7.50%')).toBeInTheDocument();
  });
});
