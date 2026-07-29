import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';

import { useConfirmacao, type PedidoConfirmacao } from './useConfirmacao';

/**
 * Componente de teste que usa o hook como um sítio real o usaria: chama
 * `confirmar` e depende do valor devolvido para decidir se age.
 */
function Sujeito({ pedido }: { pedido: PedidoConfirmacao }) {
  const { confirmar, dialogo } = useConfirmacao();
  const [resultado, setResultado] = useState<string>('nada');

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          const ok = await confirmar(pedido);
          setResultado(ok ? 'executou' : 'cancelou');
        }}
      >
        Remover documento
      </button>
      <p>estado: {resultado}</p>
      {dialogo}
    </>
  );
}

const PEDIDO: PedidoConfirmacao = {
  titulo: 'Remover este documento?',
  descricao: 'O ficheiro é apagado e não pode ser recuperado.',
  acao: 'Remover',
  destrutiva: true,
};

describe('useConfirmacao', () => {
  it('não age enquanto o utilizador não confirmar', () => {
    render(<Sujeito pedido={PEDIDO} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover documento' }));
    expect(screen.getByText('estado: nada')).toBeTruthy();
  });

  it('resolve com true ao confirmar', async () => {
    render(<Sujeito pedido={PEDIDO} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover documento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(screen.getByText('estado: executou')).toBeTruthy());
  });

  it('resolve com false ao cancelar — a acção não acontece', async () => {
    render(<Sujeito pedido={PEDIDO} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover documento' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.getByText('estado: cancelou')).toBeTruthy());
  });

  it('mostra o título e a descrição dados', async () => {
    render(<Sujeito pedido={PEDIDO} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover documento' }));
    expect(await screen.findByText('Remover este documento?')).toBeTruthy();
    expect(screen.getByText('O ficheiro é apagado e não pode ser recuperado.')).toBeTruthy();
  });

  it('o botão de confirmar diz a acção, não "OK"', async () => {
    render(<Sujeito pedido={PEDIDO} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover documento' }));
    expect(await screen.findByRole('button', { name: 'Remover' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'OK' })).toBeNull();
  });

  it('tem sempre descrição, mesmo quando não é dada', async () => {
    // O AlertDialog liga-se à descrição por aria-describedby; sem ela, o
    // atributo aponta para nada.
    render(<Sujeito pedido={{ titulo: 'Continuar?' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover documento' }));
    expect(await screen.findByText('Esta acção não pode ser desfeita.')).toBeTruthy();
  });

  it('fechar o diálogo pelo Escape conta como cancelar', async () => {
    // Sem isto a Promise ficava presa e o chamador esperava para sempre.
    render(<Sujeito pedido={PEDIDO} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover documento' }));
    await screen.findByText('Remover este documento?');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.getByText('estado: cancelou')).toBeTruthy());
  });

  it('um segundo pedido não deixa o primeiro preso', async () => {
    render(<Sujeito pedido={PEDIDO} />);
    const gatilho = screen.getByRole('button', { name: 'Remover documento' });
    fireEvent.click(gatilho);
    fireEvent.click(gatilho);
    // O primeiro resolve como cancelado; o segundo fica pendente e confirma.
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));
    await waitFor(() => expect(screen.getByText('estado: executou')).toBeTruthy());
  });
});
