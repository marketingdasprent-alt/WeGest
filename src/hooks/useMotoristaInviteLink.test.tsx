import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const useTenant = vi.fn();
const toast = vi.fn();
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => useTenant() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

import { useMotoristaInviteLink } from './useMotoristaInviteLink';

const comCodigo = (codigo: string | null) => ({
  orgId: 'org-x',
  orgs: [{ id: 'org-x', nome: 'Empresa X', codigo }],
});

describe('useMotoristaInviteLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it('constrói o link de registo com o código da org ativa', () => {
    useTenant.mockReturnValue(comCodigo('empresa-x'));
    const { result } = renderHook(() => useMotoristaInviteLink());
    expect(result.current.link).toBe(`${window.location.origin}/motorista/registo?org=empresa-x`);
  });

  it('devolve link nulo quando a org ativa não tem código', () => {
    useTenant.mockReturnValue(comCodigo(null));
    const { result } = renderHook(() => useMotoristaInviteLink());
    expect(result.current.link).toBeNull();
  });

  it('copia o link para a área de transferência', async () => {
    useTenant.mockReturnValue(comCodigo('empresa-x'));
    const { result } = renderHook(() => useMotoristaInviteLink());
    await act(() => result.current.copiar());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/motorista/registo?org=empresa-x`
    );
  });

  it('não tenta copiar quando não há link', async () => {
    useTenant.mockReturnValue(comCodigo(null));
    const { result } = renderHook(() => useMotoristaInviteLink());
    await act(() => result.current.copiar());
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });
});
