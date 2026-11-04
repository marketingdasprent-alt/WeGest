import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RentingClientesPorLiquidar from './RentingClientesPorLiquidar';

vi.mock('@/components/administrativo/por-liquidar/FaturasPorLiquidarTab', () => ({
  FaturasPorLiquidarTab: () => <div>conteúdo por liquidar</div>,
}));

describe('RentingClientesPorLiquidar', () => {
  const renderPagina = () =>
    render(
      <MemoryRouter initialEntries={['/renting/clientes/por-liquidar']}>
        <Routes>
          <Route path="/renting/clientes/por-liquidar" element={<RentingClientesPorLiquidar />} />
          <Route path="/renting/clientes" element={<div>lista de clientes</div>} />
        </Routes>
      </MemoryRouter>
    );

  it('mostra as faturas por liquidar', () => {
    renderPagina();
    expect(screen.getByText('conteúdo por liquidar')).toBeInTheDocument();
  });

  it('o botão Clientes volta à lista de clientes', () => {
    renderPagina();
    fireEvent.click(screen.getByRole('button', { name: /clientes/i }));
    expect(screen.getByText('lista de clientes')).toBeInTheDocument();
  });
});
