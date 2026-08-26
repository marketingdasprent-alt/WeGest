import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { EnviarParaAssinaturaDialog } from './EnviarParaAssinaturaDialog';
import type { Signatario } from '@/lib/assinaturas';

/**
 * Escolher quem assina.
 *
 * As duas coisas que este ecrã tem de acertar são as que se pagam caro depois:
 * não deixar sair um pedido para quem não tem email (ficaria a faltar uma
 * assinatura sem ninguém saber porquê) e avisar quando a mesma pessoa vai
 * receber dois pedidos, o que acontece sempre que o cliente também é condutor.
 */

const ana: Signatario = {
  papel: 'cliente',
  nome: 'Ana Reis',
  email: 'ana@exemplo.pt',
  clienteId: 'c1',
};

function abrir(props: Partial<Parameters<typeof EnviarParaAssinaturaDialog>[0]> = {}) {
  return render(
    <EnviarParaAssinaturaDialog
      open
      onOpenChange={vi.fn()}
      candidatos={[ana]}
      onEnviar={vi.fn()}
      {...props}
    />
  );
}

describe('EnviarParaAssinaturaDialog', () => {
  it('não deixa escolher quem não tem email, e diz porquê', () => {
    abrir({
      candidatos: [ana, { papel: 'condutor', nome: 'Juliano Cury', email: null }],
    });

    expect(screen.getByLabelText(/Juliano Cury/)).toBeDisabled();
    expect(screen.getByText(/sem email na ficha/i)).toBeInTheDocument();
  });

  it('avisa quando a mesma pessoa vai receber dois pedidos', () => {
    abrir({
      candidatos: [ana, { ...ana, papel: 'condutor' }],
    });

    fireEvent.click(screen.getByLabelText(/Ana Reis.*cliente/i));
    fireEvent.click(screen.getByLabelText(/Ana Reis.*condutor/i));

    expect(screen.getByText(/Ana Reis vai receber dois pedidos/i)).toBeInTheDocument();
  });

  it('não envia sem ninguém escolhido', () => {
    const onEnviar = vi.fn();
    abrir({ onEnviar });

    expect(screen.getByRole('button', { name: /enviar/i })).toBeDisabled();
    expect(onEnviar).not.toHaveBeenCalled();
  });

  it('envia só quem foi escolhido', async () => {
    const onEnviar = vi.fn().mockResolvedValue(undefined);
    abrir({
      candidatos: [ana, { papel: 'motorista', nome: 'Rui Dias', email: 'rui@exemplo.pt' }],
      onEnviar,
    });

    fireEvent.click(screen.getByLabelText(/Ana Reis/));
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    await waitFor(() => expect(onEnviar).toHaveBeenCalledTimes(1));
    expect(onEnviar).toHaveBeenCalledWith([expect.objectContaining({ nome: 'Ana Reis' })]);
  });

  it('mostra o erro e deixa tentar outra vez quando o envio falha', async () => {
    const onEnviar = vi.fn().mockRejectedValue(new Error('sem rede'));
    abrir({ onEnviar });

    fireEvent.click(screen.getByLabelText(/Ana Reis/));
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));

    expect(await screen.findByText(/sem rede/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enviar/i })).toBeEnabled();
  });
});
