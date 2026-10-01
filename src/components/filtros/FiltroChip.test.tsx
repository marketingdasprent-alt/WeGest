import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { FiltroChip } from './FiltroChip';

const OPCOES = [
  { value: 'all', label: 'Todos', count: 289 },
  { value: 'eletrico', label: 'Elétrico', count: 52 },
];

const abrir = (texto: string) => {
  const gatilho = screen.getByText(texto).closest('button');
  if (!gatilho) throw new Error('sem gatilho');
  fireEvent.pointerDown(gatilho, { button: 0, ctrlKey: false, pointerType: 'mouse' });
};

describe('FiltroChip', () => {
  it('neutro: mostra "Etiqueta: Todos" e não tem ✕', () => {
    render(<FiltroChip label="Combustível" value="all" options={OPCOES} onChange={vi.fn()} />);
    expect(screen.getByText('Todos')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /limpar/i })).toBeNull();
  });

  it('abre a lista com a contagem de cada opção e escolhe', () => {
    const onChange = vi.fn();
    render(<FiltroChip label="Combustível" value="all" options={OPCOES} onChange={onChange} />);
    abrir('Todos');
    expect(screen.getByText('52')).not.toBeNull();
    fireEvent.click(screen.getByText('Elétrico'));
    expect(onChange).toHaveBeenCalledWith('eletrico');
  });

  it('activo: ✕ volta ao valor neutro', () => {
    const onChange = vi.fn();
    render(
      <FiltroChip label="Combustível" value="eletrico" options={OPCOES} onChange={onChange} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtro Combustível' }));
    expect(onChange).toHaveBeenCalledWith('all');
  });
});
