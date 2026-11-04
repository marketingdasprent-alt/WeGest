import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { EVENTO_VERSAO_NOVA } from '@/lib/pwaArranque';
import { ESPERA_SW_NOVO_MS, UpdateNotification } from './UpdateNotification';

function prepararAtualizacao() {
  const actualizar = vi.fn(async () => undefined);
  window.__swUpdate = actualizar;
  const recarregar = vi.fn();
  vi.spyOn(window, 'location', 'get').mockReturnValue({
    reload: recarregar,
  } as unknown as Location);
  return { actualizar, recarregar };
}

describe('UpdateNotification', () => {
  afterEach(() => {
    delete window.__swUpdate;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('Atualizar não apaga as caches (o precache do SW novo tem de ficar)', async () => {
    const { actualizar } = prepararAtualizacao();
    const apagar = vi.fn(async () => true);
    vi.stubGlobal('caches', { keys: async () => ['workbox-precache-v2'], delete: apagar });
    render(<UpdateNotification />);
    fireEvent.click(screen.getByRole('button', { name: /Atualizar/ }));
    await vi.waitFor(() => expect(actualizar).toHaveBeenCalled());
    expect(apagar).not.toHaveBeenCalled();
  });

  it('não recarrega antes de o SW novo assumir: era isso que trazia o aviso de volta', async () => {
    vi.useFakeTimers();
    const { actualizar, recarregar } = prepararAtualizacao();
    render(<UpdateNotification />);
    fireEvent.click(screen.getByRole('button', { name: /Atualizar/ }));
    await act(async () => {});
    expect(actualizar).toHaveBeenCalled();
    expect(recarregar).not.toHaveBeenCalled();

    // Se o SW novo nunca assumir, recarrega-se na mesma ao fim da espera.
    act(() => {
      vi.advanceTimersByTime(ESPERA_SW_NOVO_MS);
    });
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it('"Mais tarde" esconde o aviso, que deixa de tapar o ecrã', () => {
    prepararAtualizacao();
    render(<UpdateNotification />);
    fireEvent.click(screen.getByRole('button', { name: 'Mais tarde' }));
    expect(screen.queryByText('Nova versão disponível')).toBeNull();
  });

  it('não aparece sem versão nova', () => {
    render(<UpdateNotification />);
    expect(screen.queryByText('Nova versão disponível')).toBeNull();
  });

  it('aparece quando o main.tsx emite o evento de versão nova', () => {
    render(<UpdateNotification />);
    act(() => {
      window.dispatchEvent(new CustomEvent(EVENTO_VERSAO_NOVA));
    });
    expect(screen.getByText('Nova versão disponível')).toBeTruthy();
  });

  it('aparece logo se o evento saiu antes da montagem (__swUpdate já definido)', () => {
    window.__swUpdate = async () => undefined;
    render(<UpdateNotification />);
    expect(screen.getByText('Nova versão disponível')).toBeTruthy();
  });
});
