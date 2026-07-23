import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AnyRentPendentesBanner, contratosAnyRentPendentes } from './AnyRentPendentesBanner';
import type { ContratoRenting } from '@/types/contratoRenting';

function contrato(overrides: Partial<ContratoRenting>): ContratoRenting {
  return {
    id: overrides.id ?? 'c1',
    codigo: 1,
    matricula: 'AA-00-AA',
    cliente_id: 'cli-1',
    km_saida: null,
    combustivel_saida: null,
    eletricidade_saida: null,
    entrega_via_any_rent: false,
    ...overrides,
  } as ContratoRenting;
}

describe('contratosAnyRentPendentes', () => {
  it('ignora contratos que não vieram do atalho Any Rent', () => {
    const lista = [contrato({ entrega_via_any_rent: false })];
    expect(contratosAnyRentPendentes(lista)).toHaveLength(0);
  });

  it('inclui um contrato Any Rent sem nenhum dado de saída', () => {
    const lista = [contrato({ entrega_via_any_rent: true })];
    expect(contratosAnyRentPendentes(lista)).toHaveLength(1);
  });

  it('exclui um contrato Any Rent já completo (km + combustível preenchidos)', () => {
    const lista = [
      contrato({ entrega_via_any_rent: true, km_saida: 1000, combustivel_saida: 'Cheio' }),
    ];
    expect(contratosAnyRentPendentes(lista)).toHaveLength(0);
  });

  it('inclui um contrato Any Rent com km preenchido mas sem combustível/bateria', () => {
    const lista = [contrato({ entrega_via_any_rent: true, km_saida: 1000 })];
    expect(contratosAnyRentPendentes(lista)).toHaveLength(1);
  });
});

describe('AnyRentPendentesBanner', () => {
  const getClienteNome = () => 'Cliente Teste';
  const getCondutorNome = () => '—';

  it('não mostra nada quando não há contratos Any Rent pendentes', () => {
    const { container } = render(
      <MemoryRouter>
        <AnyRentPendentesBanner
          contratos={[contrato({ entrega_via_any_rent: false })]}
          getClienteNome={getClienteNome}
          getCondutorNome={getCondutorNome}
        />
      </MemoryRouter>
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra a contagem e abre a lista ao clicar em "Ver contratos"', () => {
    const pendentes = [
      contrato({ id: 'c1', codigo: 370, matricula: 'BH-84-OM', entrega_via_any_rent: true }),
      contrato({ id: 'c2', codigo: 372, matricula: 'BT-14-UM', entrega_via_any_rent: true }),
    ];

    render(
      <MemoryRouter>
        <AnyRentPendentesBanner
          contratos={pendentes}
          getClienteNome={getClienteNome}
          getCondutorNome={getCondutorNome}
        />
      </MemoryRouter>
    );

    expect(screen.getByText(/2 contratos Any Rent/i)).toBeTruthy();

    fireEvent.click(screen.getByText('Ver contratos'));

    expect(screen.getByText(/Contrato #0370 · BH-84-OM/)).toBeTruthy();
    expect(screen.getByText(/Contrato #0372 · BT-14-UM/)).toBeTruthy();
  });

  it('ao clicar num contrato da lista, fecha o dialog', () => {
    const pendentes = [
      contrato({ id: 'c1', codigo: 370, matricula: 'BH-84-OM', entrega_via_any_rent: true }),
    ];

    render(
      <MemoryRouter>
        <AnyRentPendentesBanner
          contratos={pendentes}
          getClienteNome={getClienteNome}
          getCondutorNome={getCondutorNome}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText('Ver contratos'));
    fireEvent.click(screen.getByText(/Contrato #0370/));

    expect(screen.queryByText(/Contrato #0370/)).toBeNull();
  });
});
