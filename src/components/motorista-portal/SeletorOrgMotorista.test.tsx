import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const switchOrg = vi.fn();
let orgsDaConta = [
  { id: 'decada', nome: 'Década Ousada' },
  { id: 'premium', nome: 'PREMIUM RIDE' },
];
let orgsMotorista = [
  { orgId: 'premium', nome: 'PREMIUM RIDE', fichaAtiva: true },
  { orgId: 'decada', nome: 'Década Ousada', fichaAtiva: false },
];

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ orgId: 'premium', orgs: orgsDaConta, switchOrg }),
}));
vi.mock('@/hooks/useOrgsMotorista', () => ({
  useOrgsMotorista: () => ({ data: orgsMotorista }),
}));

import { SeletorOrgMotorista } from './SeletorOrgMotorista';

describe('SeletorOrgMotorista', () => {
  beforeEach(() => {
    switchOrg.mockReset();
    orgsDaConta = [
      { id: 'decada', nome: 'Década Ousada' },
      { id: 'premium', nome: 'PREMIUM RIDE' },
    ];
    orgsMotorista = [
      { orgId: 'premium', nome: 'PREMIUM RIDE', fichaAtiva: true },
      { orgId: 'decada', nome: 'Década Ousada', fichaAtiva: true },
    ];
  });

  it('mostra a empresa atual e troca para a outra ao escolher', () => {
    render(<SeletorOrgMotorista />);
    const botao = screen.getByRole('button', { name: 'Escolher empresa' });
    expect(botao.textContent).toContain('PREMIUM RIDE');

    fireEvent.pointerDown(botao, { button: 0, ctrlKey: false });
    fireEvent.click(screen.getByText('Década Ousada'));
    expect(switchOrg).toHaveBeenCalledWith('decada');
  });

  it('ficha inativa não aparece: só fica a ativa e o seletor some', () => {
    orgsMotorista = [
      { orgId: 'premium', nome: 'PREMIUM RIDE', fichaAtiva: true },
      { orgId: 'decada', nome: 'Década Ousada', fichaAtiva: false },
    ];
    render(<SeletorOrgMotorista />);
    expect(screen.queryByRole('button', { name: 'Escolher empresa' })).toBeNull();
  });

  it('com uma só empresa não aparece', () => {
    orgsMotorista = [{ orgId: 'premium', nome: 'PREMIUM RIDE', fichaAtiva: true }];
    render(<SeletorOrgMotorista />);
    expect(screen.queryByRole('button', { name: 'Escolher empresa' })).toBeNull();
  });

  it('empresa onde tem ficha mas a conta não pertence não entra no seletor', () => {
    orgsDaConta = [{ id: 'premium', nome: 'PREMIUM RIDE' }];
    render(<SeletorOrgMotorista />);
    expect(screen.queryByRole('button', { name: 'Escolher empresa' })).toBeNull();
  });
});
