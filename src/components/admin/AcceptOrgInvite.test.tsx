import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AcceptOrgInvite } from './AcceptOrgInvite';
const { accept, signIn } = vi.hoisted(() => ({ accept: vi.fn(), signIn: vi.fn() }));
vi.mock('@/hooks/useAcceptOrgInvite', () => ({
  useAcceptOrgInvite: () => ({ mutateAsync: accept, isPending: false }),
  useSignInForInvite: () => ({ mutateAsync: signIn, isPending: false }),
}));

describe('aceitação de convite existente', () => {
  it('diz que organização convida antes de aceitar', () => {
    render(
      <AcceptOrgInvite
        token="token"
        email="titular@example.test"
        orgNome="Premium Ride"
        currentEmail="titular@example.test"
        onAccepted={vi.fn()}
      />
    );
    expect(screen.getByText(/Premium Ride/)).toBeTruthy();
  });

  it('não associa automaticamente e requer clique explícito do titular autenticado', async () => {
    accept.mockResolvedValue(undefined);
    const onAccepted = vi.fn();
    render(
      <AcceptOrgInvite
        token="token"
        email="titular@example.test"
        currentEmail="titular@example.test"
        onAccepted={onAccepted}
      />
    );
    expect(accept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar convite' }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith('token'));
    expect(onAccepted).toHaveBeenCalledOnce();
  });
  it('não permite aceitar com outra conta', () => {
    render(
      <AcceptOrgInvite
        token="token"
        email="titular@example.test"
        currentEmail="outro@example.test"
        onAccepted={vi.fn()}
      />
    );
    expect(
      (screen.getByRole('button', { name: 'Aceitar convite' }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.getByText(/outra conta/)).toBeTruthy();
  });
  it('apresenta erro de aceitação em vez de navegar', async () => {
    accept.mockRejectedValue(new Error('Convite expirado'));
    const onAccepted = vi.fn();
    render(
      <AcceptOrgInvite
        token="token"
        email="titular@example.test"
        currentEmail="titular@example.test"
        onAccepted={onAccepted}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar convite' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Convite expirado');
    expect(onAccepted).not.toHaveBeenCalled();
  });
});
