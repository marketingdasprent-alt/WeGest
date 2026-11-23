import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { PedidoPrecoSemanal } from './PedidoPrecoSemanal';

const pendente = vi.hoisted(() => ({ data: null as null | { valor_pedido: number } }));
const dialogo = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/usePedidosTrocaKms', () => ({
  usePedidoTrocaKmsPendente: () => pendente,
}));
vi.mock('./PedirAlteracaoContratoDialog', () => ({
  PedirAlteracaoContratoDialog: (p: { valorAtual: number }) => {
    dialogo(p);
    return <div>dialogo</div>;
  },
}));

describe('PedidoPrecoSemanal', () => {
  beforeEach(() => {
    pendente.data = null;
    dialogo.mockClear();
  });

  it('o pedido parte do valor semanal em vigor, não do manual', () => {
    render(<PedidoPrecoSemanal contratoId="c1" valorAtual={275} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pedir alteração do valor semanal' }));
    expect(dialogo).toHaveBeenCalledWith(expect.objectContaining({ valorAtual: 275 }));
  });

  it('sem pedido pendente não mostra aviso', () => {
    render(<PedidoPrecoSemanal contratoId="c1" valorAtual={275} />);
    expect(screen.queryByText(/Pendente de aprovação/)).toBeNull();
  });

  it('com pedido pendente mostra o valor pedido', () => {
    pendente.data = { valor_pedido: 225 };
    render(<PedidoPrecoSemanal contratoId="c1" valorAtual={275} />);
    expect(screen.getByText(/Pendente de aprovação:/).textContent).toContain('225,00');
  });

  it('a carregar ou sem preço: não há botão, para nunca gravar "0 → X"', () => {
    const { rerender } = render(
      <PedidoPrecoSemanal contratoId="c1" valorAtual={null} carregando />
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/a carregar o preço/)).toBeInTheDocument();
    rerender(<PedidoPrecoSemanal contratoId="c1" valorAtual={null} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/sem preço de partida/)).toBeInTheDocument();
  });

  it('0 € real é um valor de partida válido', () => {
    render(<PedidoPrecoSemanal contratoId="c1" valorAtual={0} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });
});
