import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { MotoristaBottomNav } from './MotoristaBottomNav';

/** Expõe a localização actual para o teste a poder ler. */
function Sonda() {
  const { pathname, search } = useLocation();
  return <output data-testid="url">{pathname + search}</output>;
}

function montar(urlInicial: string) {
  return render(
    <MemoryRouter initialEntries={[urlInicial]}>
      <MotoristaBottomNav />
      <Sonda />
    </MemoryRouter>
  );
}

describe('MotoristaBottomNav', () => {
  it('mostra as quatro secções', () => {
    montar('/motorista/painel');
    expect(screen.getByRole('button', { name: 'Início' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Viatura' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Contas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Documentos' })).toBeInTheDocument();
  });

  it('marca a secção do URL como actual', () => {
    montar('/motorista/painel?tab=contas');
    expect(screen.getByRole('button', { name: 'Contas' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Início' })).not.toHaveAttribute('aria-current');
  });

  it('tocar numa secção muda o URL', () => {
    montar('/motorista/painel');
    fireEvent.click(screen.getByRole('button', { name: 'Viatura' }));
    expect(screen.getByTestId('url')).toHaveTextContent('/motorista/painel?tab=viatura');
  });

  it('voltar ao Início limpa o parâmetro', () => {
    montar('/motorista/painel?tab=documentos');
    fireEvent.click(screen.getByRole('button', { name: 'Início' }));
    expect(screen.getByTestId('url')).toHaveTextContent(/^\/motorista\/painel$/);
  });

  it('a partir do detalhe de um acordo, Contas está acesa e as secções levam de volta ao painel', () => {
    montar('/motorista/painel/acordos/abc');
    expect(screen.getByRole('button', { name: 'Contas' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Início' }));
    expect(screen.getByTestId('url')).toHaveTextContent(/^\/motorista\/painel$/);
  });
});
