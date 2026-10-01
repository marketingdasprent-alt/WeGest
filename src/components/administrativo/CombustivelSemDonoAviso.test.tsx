import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { CombustivelSemDonoAviso } from './CombustivelSemDonoAviso';

const GRUPOS = [
  { fonte: 'edp' as const, cartao: '5000000000030258', transacoes: 85, valor: 1341.2 },
  { fonte: 'bp' as const, cartao: '121', transacoes: 2, valor: 100 },
];

describe('CombustivelSemDonoAviso', () => {
  it('sem casos, não aparece', () => {
    const { container } = render(<CombustivelSemDonoAviso grupos={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('diz quantos, quanto, e que fechar deixa por cobrar', () => {
    render(<CombustivelSemDonoAviso grupos={GRUPOS} />);
    const texto = screen.getByRole('alert').textContent ?? '';
    expect(texto).toContain('87 abastecimentos');
    expect(texto).toContain('1441,20');
    expect(texto).toContain('por cobrar');
  });

  it('"Ver cartões" mostra cada cartão com a fonte e onde se resolve', () => {
    render(<CombustivelSemDonoAviso grupos={GRUPOS} />);
    expect(screen.queryByText('5000000000030258')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver cartões' }));
    expect(screen.getByText('5000000000030258')).not.toBeNull();
    expect(screen.getByText('EDP')).not.toBeNull();
    expect(screen.getByText('BP')).not.toBeNull();
    expect(screen.getByRole('alert').textContent).toContain('Cartões Frota');
  });
});
