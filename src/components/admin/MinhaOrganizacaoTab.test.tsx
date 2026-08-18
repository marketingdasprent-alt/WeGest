import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { supabase } from '@/integrations/supabase/client';

const useTenant = vi.fn();
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => useTenant() }));

const canEdit = vi.fn();
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canEdit }) }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from 'sonner';
import { MinhaOrganizacaoTab } from './MinhaOrganizacaoTab';

const mockOrg = {
  nome: 'Organização X',
  codigo: 'org-x',
  nif: '123456789',
  morada: 'Rua A, 1',
  telefone: '900000000',
  logo_url: '',
  email_suporte: 'suporte@exemplo.pt',
};

// Chain mínimo pro que o componente usa: select().eq().single() e update().eq().
function chainable(result: unknown) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  c.select = vi.fn().mockReturnValue(c);
  c.eq = vi.fn().mockReturnValue(c);
  c.single = vi.fn().mockResolvedValue(result);
  c.update = vi.fn().mockReturnValue(c);
  return c;
}

describe('MinhaOrganizacaoTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTenant.mockReturnValue({ orgId: 'org-1' });
  });

  it('modo leitura: sem permissão de editar, mostra dados e não mostra Guardar', async () => {
    canEdit.mockReturnValue(false);
    const chain = chainable({ data: mockOrg, error: null });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    render(<MinhaOrganizacaoTab />);

    expect(await screen.findByText('Organização X')).toBeTruthy();
    expect(screen.queryByLabelText('Nome')).toBeNull();
    expect(screen.queryByRole('button', { name: /guardar/i })).toBeNull();
  });

  it('modo edição: permite alterar o nome e grava', async () => {
    canEdit.mockReturnValue(true);
    const chain = chainable({ data: mockOrg, error: null });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    render(<MinhaOrganizacaoTab />);

    const nomeInput = await screen.findByLabelText('Nome');
    fireEvent.change(nomeInput, { target: { value: 'Organização Y' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(chain.update).toHaveBeenCalled());
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Organização Y', codigo: 'org-x' })
    );
    expect(chain.eq).toHaveBeenCalledWith('id', 'org-1');
  });

  it('modo edição: grava o email de suporte', async () => {
    canEdit.mockReturnValue(true);
    const chain = chainable({ data: mockOrg, error: null });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    render(<MinhaOrganizacaoTab />);

    const emailInput = await screen.findByLabelText('Email de suporte');
    fireEvent.change(emailInput, { target: { value: 'informatica@exemplo.pt' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(chain.update).toHaveBeenCalled());
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ email_suporte: 'informatica@exemplo.pt' })
    );
  });

  // É este NULL que desliga o aviso de novos pedidos — sem ele, apagar o campo
  // gravava uma string vazia e o lado do servidor tinha de a tratar como "sem
  // destinatário" em vez de simplesmente não ter valor.
  it('modo edição: apagar o email de suporte grava null', async () => {
    canEdit.mockReturnValue(true);
    const chain = chainable({ data: mockOrg, error: null });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    render(<MinhaOrganizacaoTab />);

    const emailInput = await screen.findByLabelText('Email de suporte');
    fireEvent.change(emailInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(chain.update).toHaveBeenCalled());
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ email_suporte: null }));
  });

  it('modo edição: bloqueia gravação com email de suporte inválido', async () => {
    canEdit.mockReturnValue(true);
    const chain = chainable({ data: mockOrg, error: null });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    render(<MinhaOrganizacaoTab />);

    const emailInput = await screen.findByLabelText('Email de suporte');
    fireEvent.change(emailInput, { target: { value: 'suporte@sem-dominio' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(chain.update).not.toHaveBeenCalled();
  });

  it('modo edição: bloqueia gravação com NIF inválido', async () => {
    canEdit.mockReturnValue(true);
    const chain = chainable({ data: mockOrg, error: null });
    (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    render(<MinhaOrganizacaoTab />);

    const nifInput = await screen.findByLabelText('NIF');
    fireEvent.change(nifInput, { target: { value: '123456780' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(chain.update).not.toHaveBeenCalled();
  });
});
