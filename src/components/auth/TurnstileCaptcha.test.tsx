import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { TurnstileCaptcha } from './TurnstileCaptcha';

const { carregar, widget } = vi.hoisted(() => {
  const widget = {
    render: vi.fn((_el: HTMLElement, _opts: Record<string, unknown>) => 'widget-1'),
    remove: vi.fn(),
  };
  return { widget, carregar: vi.fn(() => Promise.resolve(widget)) };
});
vi.mock('@/lib/turnstile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/turnstile')>()),
  carregarTurnstile: carregar,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('TurnstileCaptcha', () => {
  it('sem chave pública configurada não mostra nada nem carrega o script', () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    const { container } = render(<TurnstileCaptcha acao="contacto" onToken={vi.fn()} />);
    expect(container.innerHTML).toBe('');
    expect(carregar).not.toHaveBeenCalled();
  });

  it('com chave, desenha o widget e entrega o token quando é resolvido', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-teste');
    const onToken = vi.fn();
    const { unmount } = render(<TurnstileCaptcha acao="contacto" onToken={onToken} />);

    await waitFor(() => expect(widget.render).toHaveBeenCalled());
    const opcoes = widget.render.mock.calls[0][1] as {
      sitekey: string;
      action: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
    };
    expect(opcoes.sitekey).toBe('site-key-teste');
    // A action liga o token ao formulário; o servidor recusa-o noutro.
    expect(opcoes.action).toBe('contacto');

    opcoes.callback('token-resolvido');
    expect(onToken).toHaveBeenLastCalledWith('token-resolvido');
    // Um token expirado deixa de servir: o formulário volta a bloquear o envio.
    opcoes['expired-callback']();
    expect(onToken).toHaveBeenLastCalledWith(null);

    unmount();
    expect(widget.remove).toHaveBeenCalledWith('widget-1');
  });
});
