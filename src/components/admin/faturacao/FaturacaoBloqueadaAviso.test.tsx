import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('@/hooks/useDesbloquearFaturacaoIntegracao', () => ({
  useDesbloquearFaturacaoIntegracao: () => ({ mutate, isPending: false }),
}));

import { FaturacaoBloqueadaAviso } from './FaturacaoBloqueadaAviso';

describe('FaturacaoBloqueadaAviso', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra o motivo e só desbloqueia depois de confirmar', async () => {
    render(
      <FaturacaoBloqueadaAviso
        integracaoId="int-1"
        motivo="Total 725 em vez de 590"
        onDesbloqueada={() => {}}
      />
    );

    expect(screen.getByText('Total 725 em vez de 590')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Desbloquear faturação' }));
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: 'Desbloquear' }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith('int-1', expect.any(Object)));
  });

  it('é um alerta acessível e diz que as notas de crédito continuam a passar', () => {
    render(<FaturacaoBloqueadaAviso integracaoId="int-1" motivo="x" onDesbloqueada={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Notas de crédito continuam/);
    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('sem motivo gravado diz que não há motivo registado', () => {
    render(
      <FaturacaoBloqueadaAviso integracaoId="int-1" motivo={null} onDesbloqueada={() => {}} />
    );
    expect(screen.getByText('Motivo não registado.')).toBeInTheDocument();
  });
});
