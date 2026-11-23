import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ValorSemanalTvde } from './ValorSemanalTvde';

const norm = (t: string) => t.replace(/\s+/g, ' ');

describe('ValorSemanalTvde', () => {
  it('mostra o valor cobrado pelo fecho e a origem tarifa', () => {
    render(<ValorSemanalTvde preco={{ valor: 275, origem: 'tarifa' }} valorTotalManual={null} />);
    expect(screen.getByText('Valor semanal (motorista)')).toBeInTheDocument();
    expect(norm(document.body.textContent ?? '')).toContain('275,00');
    expect(screen.getByText('(tarifa)')).toBeInTheDocument();
    expect(screen.queryByText('Faturar ao cliente')).toBeNull();
  });

  it('com manual diferente (225), mostra à parte o que se factura e avisa', () => {
    render(<ValorSemanalTvde preco={{ valor: 275, origem: 'tarifa' }} valorTotalManual={225} />);
    expect(screen.getByText('Faturar ao cliente')).toBeInTheDocument();
    expect(screen.getByText('Este valor não é o que o motorista paga.')).toBeInTheDocument();
    expect(norm(document.body.textContent ?? '')).toContain('225,00');
  });

  it('manual igual ao cobrado não repete a linha', () => {
    render(<ValorSemanalTvde preco={{ valor: 225, origem: 'acordado' }} valorTotalManual={225} />);
    expect(screen.getByText('(acordado)')).toBeInTheDocument();
    expect(screen.queryByText('Faturar ao cliente')).toBeNull();
  });

  it('sem preço e a carregar têm texto próprio, sem inventar valor', () => {
    const { rerender } = render(
      <ValorSemanalTvde preco={{ valor: null, origem: 'sem-preco' }} valorTotalManual={null} />
    );
    expect(screen.getByText('Sem preço')).toBeInTheDocument();
    rerender(<ValorSemanalTvde preco={undefined} valorTotalManual={225} />);
    expect(screen.getByText('A carregar…')).toBeInTheDocument();
  });

  it('ruído de vírgula flutuante (0,1 + 0,2 vs 0,3) não conta como diferença', () => {
    render(
      <ValorSemanalTvde preco={{ valor: 0.3, origem: 'acordado' }} valorTotalManual={0.1 + 0.2} />
    );
    expect(screen.queryByText('Faturar ao cliente')).toBeNull();
  });

  it('erro de leitura mostra o erro, não um valor', () => {
    render(<ValorSemanalTvde preco={undefined} valorTotalManual={225} erro />);
    expect(screen.getByText('Erro a ler o preço')).toBeInTheDocument();
    expect(screen.queryByText('Faturar ao cliente')).toBeNull();
  });
});
