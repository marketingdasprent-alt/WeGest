import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mutateAsync, reset } = vi.hoisted(() => ({ mutateAsync: vi.fn(), reset: vi.fn() }));

vi.mock('@/hooks/useApiChaves', () => ({
  useCriarApiChave: () => ({ mutateAsync, reset, isPending: false }),
}));

import { ApiChaveNovaDialog } from './ApiChaveNovaDialog';

function abrirECriar(onOpenChange = vi.fn()) {
  render(<ApiChaveNovaDialog open onOpenChange={onOpenChange} />);
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Website' } });
  fireEvent.click(screen.getByRole('button', { name: /Criar chave/ }));
  return onOpenChange;
}

beforeEach(() => {
  mutateAsync.mockReset();
  reset.mockReset();
});

describe('ApiChaveNovaDialog', () => {
  it('mostra a chave uma vez e, ao fechar, limpa-a também do MutationCache', async () => {
    mutateAsync.mockResolvedValue({ id: 'k1', chave: 'wg_ra_segredo', prefixo: 'wg_ra_segr' });
    const onOpenChange = abrirECriar();
    expect(await screen.findByDisplayValue('wg_ra_segredo')).toBeTruthy();

    // Dois "Fechar": o do rodapé (1.º no DOM) e o X do Radix.
    const [rodape, x] = screen.getAllByRole('button', { name: 'Fechar' }) as HTMLButtonElement[];
    // Sem copiar nem confirmar, nenhum dos dois fecha.
    expect(rodape.disabled).toBe(true);
    fireEvent.click(x);
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText('Já guardei a chave'));
    fireEvent.click(rodape);
    expect(reset).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('se a criação falhar, fica no formulário sem rejeição por apanhar', async () => {
    mutateAsync.mockRejectedValue(new Error('Só administradores'));
    abrirECriar();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /Criar chave/ })).toBeTruthy();
    expect(screen.queryByDisplayValue(/wg_ra_/)).toBeNull();
  });
});
