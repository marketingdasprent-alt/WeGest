import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { FolhaDanosPendentesBanner } from './FolhaDanosPendentesBanner';
import type { ContratoRenting } from '@/types/contratoRenting';

function contrato(overrides: Partial<ContratoRenting>): ContratoRenting {
  return {
    id: overrides.id ?? 'c1',
    codigo: 1,
    matricula: 'AA-00-AA',
    cliente_id: 'cli-1',
    estado_operacional: 'em_curso',
    km_saida: null,
    combustivel_saida: null,
    eletricidade_saida: null,
    entrega_via_any_rent: false,
    ...overrides,
  } as ContratoRenting;
}

const getClienteNome = () => 'Cliente Teste';
const getCondutorNome = () => '—';

function renderBanner(contratos: ContratoRenting[]) {
  return render(
    <MemoryRouter>
      <FolhaDanosPendentesBanner
        contratos={contratos}
        getClienteNome={getClienteNome}
        getCondutorNome={getCondutorNome}
      />
    </MemoryRouter>
  );
}

describe('FolhaDanosPendentesBanner', () => {
  it('não mostra nada quando não há folhas de danos por completar', () => {
    const { container } = renderBanner([contrato({ km_saida: 1000, combustivel_saida: 'Cheio' })]);
    expect(container).toBeEmptyDOMElement();
  });

  it('não conta os contratos Any Rent, que têm banner próprio', () => {
    const { container } = renderBanner([contrato({ entrega_via_any_rent: true })]);
    expect(container).toBeEmptyDOMElement();
  });

  it('mostra a contagem e abre a lista ao clicar em "Ver contratos"', () => {
    renderBanner([
      contrato({ id: 'c1', codigo: 370, matricula: 'BH-84-OM' }),
      contrato({ id: 'c2', codigo: 372, matricula: 'BT-14-UM' }),
    ]);

    expect(screen.getByText(/2 contratos/i)).toBeTruthy();

    fireEvent.click(screen.getByText('Ver contratos'));

    expect(screen.getByText(/Contrato #0370 · BH-84-OM/)).toBeTruthy();
    expect(screen.getByText(/Contrato #0372 · BT-14-UM/)).toBeTruthy();
  });

  it('ao clicar num contrato da lista, fecha o dialog', () => {
    renderBanner([contrato({ id: 'c1', codigo: 370, matricula: 'BH-84-OM' })]);

    fireEvent.click(screen.getByText('Ver contratos'));
    fireEvent.click(screen.getByText(/Contrato #0370/));

    expect(screen.queryByText(/Contrato #0370/)).toBeNull();
  });
});
