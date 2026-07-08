import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const useTenant = vi.fn();
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => useTenant() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { MotoristaInviteLink } from './MotoristaInviteLink';

describe('MotoristaInviteLink', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra o link com o código da org ativa', () => {
    useTenant.mockReturnValue({
      orgId: 'org-x',
      orgs: [{ id: 'org-x', nome: 'Empresa X', codigo: 'empresa-x' }],
    });
    render(<MotoristaInviteLink />);
    expect(screen.getByText(/\/motorista\/registo\?org=empresa-x/)).toBeTruthy();
  });

  it('avisa quando a org ativa não tem código', () => {
    useTenant.mockReturnValue({ orgId: 'org-x', orgs: [{ id: 'org-x', nome: 'X', codigo: null }] });
    render(<MotoristaInviteLink />);
    expect(screen.getByText(/sem código/i)).toBeTruthy();
  });
});
