import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import {
  ViaturaFinanceiraReceitas,
  ViaturaFinanceiraDespesas,
  type ReceitasData,
} from './ViaturaFinanceiraMovimentos';

const tvdeReceitas: ReceitasData = {
  contratoReceita: 900,
  contratoRegime: 'tvde',
  contratoDetalhe: { tipo: 'tvde', valorSemanal: 300, semanas: 3 },
  multas: 0,
  danos: 0,
  loading: false,
};

describe('ViaturaFinanceiraReceitas', () => {
  it('sem contrato ativo, mostra estado vazio em vez de €0,00', () => {
    render(
      <ViaturaFinanceiraReceitas
        receitas={{
          contratoReceita: 0,
          contratoRegime: null,
          contratoDetalhe: null,
          multas: 0,
          danos: 0,
          loading: false,
        }}
        loadReceitas={() => {}}
      />
    );
    expect(screen.getByText(/sem contrato ativo/i)).toBeInTheDocument();
  });

  it('TVDE: mostra receita do contrato, badge TVDE, e detalhe (tarifa × semanas) no popover', () => {
    render(<ViaturaFinanceiraReceitas receitas={tvdeReceitas} loadReceitas={() => {}} />);
    expect(screen.getByText('€900,00')).toBeInTheDocument();
    expect(screen.getByText('TVDE')).toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: /ver detalhe de receita do contrato/i });
    fireEvent.click(trigger);

    const popoverBody = screen.getByText(/detalhe de receita do contrato/i).parentElement!;
    expect(within(popoverBody).getByText('Tarifa semanal')).toBeInTheDocument();
    expect(within(popoverBody).getByText('€300,00')).toBeInTheDocument();
    expect(within(popoverBody).getByText('Semanas ativas')).toBeInTheDocument();
    expect(within(popoverBody).getByText('3')).toBeInTheDocument();
  });

  it('Rent-a-Car com override manual: badge Rent-a-Car e detalhe indica valor manual', () => {
    render(
      <ViaturaFinanceiraReceitas
        receitas={{
          contratoReceita: 500,
          contratoRegime: 'rent_a_car',
          contratoDetalhe: { tipo: 'rent_a_car', tarifaDiaria: 999, dias: 10, override: true },
          multas: 0,
          danos: 0,
          loading: false,
        }}
        loadReceitas={() => {}}
      />
    );
    expect(screen.getByText('€500,00')).toBeInTheDocument();
    expect(screen.getByText('Rent-a-Car')).toBeInTheDocument();
  });
});

describe('ViaturaFinanceiraDespesas', () => {
  it('mostra Multas, Danos e o total (multas+danos), sem combustível/portagens', () => {
    render(
      <ViaturaFinanceiraDespesas
        receitas={{ ...tvdeReceitas, contratoReceita: 0, multas: 60, danos: 150 }}
      />
    );
    expect(screen.getByText('€210,00')).toBeInTheDocument(); // total
    expect(screen.getByText('€60,00')).toBeInTheDocument(); // multas
    expect(screen.getByText('€150,00')).toBeInTheDocument(); // danos
    expect(screen.queryByText('Combustível')).not.toBeInTheDocument();
    expect(screen.queryByText('Portagens')).not.toBeInTheDocument();
  });
});
