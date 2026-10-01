import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { waitFor } from '@testing-library/react';

const useTenant = vi.fn();
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => useTenant() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { MotoristaConviteDialog } from './MotoristaConviteDialog';

const LINK = `${window.location.origin}/motorista/registo?org=empresa-x`;

const comCodigo = (codigo: string | null) => ({
  orgId: 'org-x',
  orgs: [{ id: 'org-x', nome: 'Empresa X', codigo }],
});

describe('MotoristaConviteDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    Reflect.deleteProperty(navigator, 'share');
  });

  it('mostra o link de registo da org ativa', () => {
    useTenant.mockReturnValue(comCodigo('empresa-x'));
    render(<MotoristaConviteDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByText(LINK)).toBeTruthy();
  });

  it('copia o link ao clicar em Copiar', async () => {
    useTenant.mockReturnValue(comCodigo('empresa-x'));
    render(<MotoristaConviteDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /copiar/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(LINK);
  });

  it('avisa quando a org ativa não tem código em vez de mostrar um link partido', () => {
    useTenant.mockReturnValue(comCodigo(null));
    render(<MotoristaConviteDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByText(/sem código/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /copiar/i })).toBeNull();
  });

  it('esconde Partilhar quando o browser não suporta navigator.share', () => {
    useTenant.mockReturnValue(comCodigo('empresa-x'));
    render(<MotoristaConviteDialog open onOpenChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /partilhar/i })).toBeNull();
  });

  it('partilha o link pelo browser quando navigator.share existe', async () => {
    useTenant.mockReturnValue(comCodigo('empresa-x'));
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share });
    render(<MotoristaConviteDialog open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /partilhar/i }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: LINK }));
  });
});
