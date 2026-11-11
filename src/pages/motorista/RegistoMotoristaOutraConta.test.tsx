import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { RegistoMotoristaOutraConta } from './RegistoMotoristaOutraConta';

vi.mock('@/components/auth/AuthMobileShell', () => ({
  AuthMobileShell: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

describe('RegistoMotoristaOutraConta', () => {
  it('mostra o e-mail da conta existente e não deixa criar outra', () => {
    const onVoltar = vi.fn();
    render(
      <MemoryRouter>
        <RegistoMotoristaOutraConta emailConta="ma********@gmail.com" onVoltar={onVoltar} />
      </MemoryRouter>
    );
    expect(screen.getByText('Já tem conta no WeGest')).toBeTruthy();
    expect(screen.getByText('ma********@gmail.com')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Iniciar sessão' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Usar outro e-mail' }));
    expect(onVoltar).toHaveBeenCalled();
  });
});
