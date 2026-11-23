import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/usePedidosTrocaKms', () => ({
  usePedidosTrocaKmsPendentes: () => ({ data: undefined, isLoading: false, error: new Error('x') }),
  usePedidosTrocaKmsHistorico: () => ({ data: undefined, isLoading: false, error: new Error('x') }),
  useResponderPedidoTrocaKms: () => ({ mutateAsync: vi.fn(), variables: undefined }),
}));

import { PedidosPendentesTab } from './PedidosPendentesTab';
import { PedidosHistoricoTab } from './PedidosHistoricoTab';

describe('estado de erro dos separadores', () => {
  it('pendentes mostra mensagem de erro', () => {
    render(
      <MemoryRouter>
        <PedidosPendentesTab />
      </MemoryRouter>
    );
    expect(screen.getByText('Não foi possível carregar os pedidos.')).toBeTruthy();
  });

  it('histórico mostra mensagem de erro', () => {
    render(
      <MemoryRouter>
        <PedidosHistoricoTab />
      </MemoryRouter>
    );
    expect(screen.getByText('Não foi possível carregar os pedidos.')).toBeTruthy();
  });
});
