import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { RaizDaApp } from './RaizDaApp';

const matchMediaOriginal = window.matchMedia;

afterEach(() => {
  window.matchMedia = matchMediaOriginal;
});

const instalado = (sim: boolean) => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: sim }) as unknown as typeof matchMedia;
};

function Sonda() {
  const { pathname } = useLocation();
  return <output data-testid="url">{pathname}</output>;
}

function montar() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <RaizDaApp>
              <p>Landing</p>
            </RaizDaApp>
          }
        />
        <Route path="/motorista/painel" element={<p>Painel</p>} />
      </Routes>
      <Sonda />
    </MemoryRouter>
  );
}

describe('RaizDaApp', () => {
  it('no browser, a raiz mostra o que sempre mostrou', () => {
    instalado(false);
    montar();
    expect(screen.getByText('Landing')).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent('/');
  });

  it('instalada como app, a raiz vai para o painel do motorista', () => {
    // Cobre quem ainda tem o manifest antigo (start_url "/") em cache: a app
    // corrige o destino sozinha em vez de abrir na landing.
    instalado(true);
    montar();
    expect(screen.getByText('Painel')).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent('/motorista/painel');
  });
});
