import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { CtaFinalSection } from './CtaFinalSection';

// O widget real carrega um script da Cloudflare; aqui basta entregar um token.
vi.mock('@/components/auth/TurnstileCaptcha', () => ({
  TurnstileCaptcha: ({ onToken }: { onToken: (token: string | null) => void }) => (
    <button type="button" onClick={() => onToken('captcha-ok')}>
      resolver captcha
    </button>
  ),
}));

function renderSeccao() {
  render(
    <MemoryRouter>
      <CtaFinalSection />
    </MemoryRouter>
  );
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Maria' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'maria@example.test' } });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('CtaFinalSection — contacto', () => {
  it('com CAPTCHA ligado, só envia depois de resolvido e manda o token', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-teste');
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: true },
      error: null,
    } as never);
    renderSeccao();

    const enviar = screen.getByRole('button', {
      name: 'Marcar os 20 minutos',
    }) as HTMLButtonElement;
    expect(enviar.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'resolver captcha' }));
    expect(enviar.disabled).toBe(false);
    fireEvent.click(enviar);

    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalled());
    const [nome, opcoes] = vi.mocked(supabase.functions.invoke).mock.calls[0];
    expect(nome).toBe('contact-inquiry');
    expect((opcoes as { body: Record<string, unknown> }).body.captcha_token).toBe('captcha-ok');
  });

  it('sem CAPTCHA configurado envia como antes, sem token', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: true },
      error: null,
    } as never);
    renderSeccao();

    fireEvent.click(screen.getByRole('button', { name: 'Marcar os 20 minutos' }));

    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalled());
    const [, opcoes] = vi.mocked(supabase.functions.invoke).mock.calls[0];
    expect('captcha_token' in (opcoes as { body: Record<string, unknown> }).body).toBe(false);
  });
});
