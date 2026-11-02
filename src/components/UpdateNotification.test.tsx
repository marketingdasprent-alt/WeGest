import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { EVENTO_VERSAO_NOVA } from '@/lib/pwaArranque';
import { UpdateNotification } from './UpdateNotification';

describe('UpdateNotification', () => {
  afterEach(() => {
    delete window.__swUpdate;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('Atualizar não apaga as caches (o precache do SW novo tem de ficar)', async () => {
    const actualizar = vi.fn(async () => undefined);
    window.__swUpdate = actualizar;
    const apagar = vi.fn(async () => true);
    vi.stubGlobal('caches', { keys: async () => ['workbox-precache-v2'], delete: apagar });
    const recarregar = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      reload: recarregar,
    } as unknown as Location);
    render(<UpdateNotification />);
    fireEvent.click(screen.getByRole('button', { name: /Atualizar/ }));
    await vi.waitFor(() => expect(recarregar).toHaveBeenCalled());
    expect(actualizar).toHaveBeenCalled();
    expect(apagar).not.toHaveBeenCalled();
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
