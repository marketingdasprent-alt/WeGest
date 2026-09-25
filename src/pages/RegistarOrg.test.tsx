import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import RegistarOrg from './RegistarOrg';

// O widget real carrega um script da Cloudflare; aqui basta entregar um token.
vi.mock('@/components/auth/TurnstileCaptcha', () => ({
  TurnstileCaptcha: ({
    acao,
    onToken,
  }: {
    acao: string;
    onToken: (token: string | null) => void;
  }) => (
    <button type="button" data-acao={acao} onClick={() => onToken('captcha-ok')}>
      resolver captcha
    </button>
  ),
}));

const campo = (id: string, valor: string) =>
  fireEvent.change(document.getElementById(id) as HTMLInputElement, { target: { value: valor } });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('RegistarOrg', () => {
  it('com CAPTCHA ligado, só regista depois de resolvido e manda o token', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key-teste');
    vi.mocked(supabase.rpc).mockResolvedValue({ data: true, error: null } as never);
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: true },
      error: null,
    } as never);
    render(
      <MemoryRouter>
        <RegistarOrg />
      </MemoryRouter>
    );

    campo('nomeEmpresa', 'Frota Teste');
    campo('codigo', 'frota-teste');
    campo('nif', '123456789');
    campo('adminNome', 'Ana');
    campo('adminEmail', 'ana@example.test');
    campo('adminPassword', 'Segura123!');
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());

    const botoes = screen.getAllByRole('button');
    const registar = botoes.find(
      (b) => (b as HTMLButtonElement).type === 'submit'
    ) as HTMLButtonElement;
    expect(registar.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'resolver captcha' }).dataset.acao).toBe(
      'registo_org'
    );
    fireEvent.click(screen.getByRole('button', { name: 'resolver captcha' }));
    await waitFor(() => expect(registar.disabled).toBe(false));
    fireEvent.click(registar);

    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalled());
    const [nome, opcoes] = vi.mocked(supabase.functions.invoke).mock.calls[0];
    expect(nome).toBe('register-org');
    expect((opcoes as { body: Record<string, unknown> }).body.captcha_token).toBe('captcha-ok');
  });
});
