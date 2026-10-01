import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ViaturasTabela } from './ViaturasTabela';

const VIATURA = {
  id: 'v1',
  matricula: 'AA-00-BB',
  marca: 'Toyota',
  modelo: 'Corolla',
  ano: 2022,
  combustivel: 'Híbrido/Gasolina',
  km_atual: 120000,
};

const montar = () => {
  const onAbrir = vi.fn();
  render(
    <ViaturasTabela
      viaturas={[VIATURA]}
      estadoDe={() => 'em_tvde'}
      situacoes={new Map([['v1', { ocupante: { tipo: 'motorista', id: 'm1', nome: 'João' } }]])}
      acoesDe={() => []}
      onAbrir={onAbrir}
      sortField="matricula"
      sortDir="asc"
      onSort={vi.fn()}
      capas={new Map()}
    />
  );
  return onAbrir;
};

describe('ViaturasTabela', () => {
  it('troca Categoria por "Com quem" e Inspeção por Documentos', () => {
    montar();
    const cabecalhos = screen.getAllByRole('columnheader').map((c) => c.textContent);
    expect(cabecalhos.join('|')).toContain('Com quem');
    expect(cabecalhos.join('|')).toContain('Documentos');
    expect(cabecalhos.join('|')).not.toContain('Categoria');
  });

  it('a linha mostra quem tem o carro e o combustível agrupado', () => {
    montar();
    expect(screen.getByText('João')).not.toBeNull();
    expect(screen.getByText('Híbrido')).not.toBeNull();
  });

  it('clicar na linha abre a viatura', () => {
    const onAbrir = montar();
    fireEvent.click(screen.getByText('AA-00-BB'));
    expect(onAbrir).toHaveBeenCalledWith(VIATURA);
  });
});
