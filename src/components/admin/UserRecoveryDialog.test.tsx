import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { UserRecoveryDialog } from './UserRecoveryDialog';

describe('recuperação de conta pelo titular', () => {
  it('informa o destino e solicita envio sem oferecer campos de palavra-passe', () => {
    const onSend = vi.fn();
    render(
      <UserRecoveryDialog
        open
        email="titular@example.test"
        isPending={false}
        onOpenChange={vi.fn()}
        onSend={onSend}
      />
    );
    expect(screen.getByText('titular@example.test')).toBeTruthy();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar recuperação' }));
    expect(onSend).toHaveBeenCalledOnce();
  });
  it('impede envios repetidos durante a operação', () => {
    render(
      <UserRecoveryDialog
        open
        email="titular@example.test"
        isPending
        onOpenChange={vi.fn()}
        onSend={vi.fn()}
      />
    );
    expect((screen.getByRole('button', { name: /A enviar/ }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });
});
