import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const useTenant = vi.fn();
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => useTenant() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { AdicionarMotoristaButton } from './AdicionarMotoristaButton';

// O DropdownMenu do Radix abre por eventos de ponteiro, que o jsdom não emite
// a partir de um fireEvent.click simples.
const abrirMenu = () => {
  const trigger = screen.getByRole('button', { name: /mais opções/i });
  fireEvent.pointerDown(trigger, { ctrlKey: false, button: 0 });
};

describe('AdicionarMotoristaButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTenant.mockReturnValue({
      orgId: 'org-x',
      orgs: [{ id: 'org-x', nome: 'Empresa X', codigo: 'empresa-x' }],
    });
  });

  it('abre a ficha ao clicar no corpo do botão', () => {
    const onAdicionar = vi.fn();
    render(<AdicionarMotoristaButton onAdicionar={onAdicionar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar Motorista' }));
    expect(onAdicionar).toHaveBeenCalledTimes(1);
  });

  it('abre o convite pelo menu sem abrir a ficha', async () => {
    const onAdicionar = vi.fn();
    render(<AdicionarMotoristaButton onAdicionar={onAdicionar} />);

    abrirMenu();
    fireEvent.click(await screen.findByText(/convidar por link/i));

    await waitFor(() =>
      expect(screen.getByText(/\/motorista\/registo\?org=empresa-x/)).toBeTruthy()
    );
    expect(onAdicionar).not.toHaveBeenCalled();
  });

  it('abre a ficha a partir do menu', async () => {
    const onAdicionar = vi.fn();
    render(<AdicionarMotoristaButton onAdicionar={onAdicionar} />);

    abrirMenu();
    fireEvent.click(await screen.findByText(/preencher ficha/i));

    await waitFor(() => expect(onAdicionar).toHaveBeenCalledTimes(1));
  });
});
