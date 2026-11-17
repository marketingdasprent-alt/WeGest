import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const resend = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { resend: (...a: unknown[]) => resend(...a) } },
}));
vi.mock('@/lib/native', () => ({
  getEmailRedirectUrl: (p: string) => `https://wegest.pt${p}`,
}));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

import { ReenviarConfirmacao } from './ReenviarConfirmacao';
import { limparEsperasReenvio } from './reenvioConfirmacaoEstado';

describe('ReenviarConfirmacao', () => {
  beforeEach(() => {
    resend.mockReset();
    toast.mockReset();
    limparEsperasReenvio();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pede um novo email de confirmação ao Supabase e bloqueia 60 segundos', async () => {
    resend.mockResolvedValue({ data: {}, error: null });
    render(<ReenviarConfirmacao email=" ze@x.pt " />);

    fireEvent.click(screen.getByRole('button', { name: /Reenviar email de confirmação/i }));

    await waitFor(() =>
      expect(resend).toHaveBeenCalledWith({
        type: 'signup',
        email: 'ze@x.pt',
        options: { emailRedirectTo: 'https://wegest.pt/motorista/login' },
      })
    );
    expect(await screen.findByRole('status')).toHaveTextContent(/pasta de spam/i);
    const botao = screen.getByRole('button', { name: /Reenviar de novo em 60 s/i });
    expect(botao).toBeDisabled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Email enviado' }));
  });

  it('o botão volta a ficar ativo depois da espera', async () => {
    vi.useFakeTimers();
    resend.mockResolvedValue({ data: {}, error: null });
    render(<ReenviarConfirmacao email="ze@x.pt" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Reenviar email de confirmação/i }));
    });
    expect(screen.getByRole('button', { name: /Reenviar de novo/i })).toBeDisabled();

    for (let i = 0; i < 60; i += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
    expect(screen.getByRole('button', { name: /Reenviar email de confirmação/i })).toBeEnabled();
  });

  it('mostra erro claro e não bloqueia quando o envio falha', async () => {
    resend.mockResolvedValue({
      data: null,
      error: { message: 'email rate limit exceeded', code: 'over_email_send_rate_limit' },
    });
    render(<ReenviarConfirmacao email="ze@x.pt" />);

    fireEvent.click(screen.getByRole('button', { name: /Reenviar email de confirmação/i }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Não foi possível reenviar',
          description: expect.stringMatching(/Demasiadas tentativas/),
          variant: 'destructive',
        })
      )
    );
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: /Reenviar email de confirmação/i })).toBeEnabled();
  });

  it('a contagem de 60 segundos não reinicia quando o componente volta a montar', async () => {
    resend.mockResolvedValue({ data: {}, error: null });
    const primeira = render(<ReenviarConfirmacao email="ze@x.pt" />);
    fireEvent.click(screen.getByRole('button', { name: /Reenviar email de confirmação/i }));
    await screen.findByRole('button', { name: /Reenviar de novo em/i });

    // O login desmonta e monta de novo o botão a cada tentativa de entrar.
    primeira.unmount();
    render(<ReenviarConfirmacao email="ze@x.pt" />);

    expect(screen.getByRole('button', { name: /Reenviar de novo em/i })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent(/pasta de spam/i);
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it('o limite de segundos do Supabase aparece em português e usa a espera dele', async () => {
    resend.mockResolvedValue({
      data: null,
      error: {
        message: 'For security purposes, you can only request this after 52 seconds.',
        code: 'over_email_send_rate_limit',
      },
    });
    render(<ReenviarConfirmacao email="ze@x.pt" />);

    fireEvent.click(screen.getByRole('button', { name: /Reenviar email de confirmação/i }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Aguarde cerca de um minuto antes de pedir outro email.',
        })
      )
    );
    expect(
      await screen.findByRole('button', { name: /Reenviar de novo em 5[12] s/i })
    ).toBeDisabled();
  });

  it('sem email não chama o Supabase', () => {
    render(<ReenviarConfirmacao email="  " />);
    fireEvent.click(screen.getByRole('button', { name: /Reenviar email de confirmação/i }));
    expect(resend).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Email em falta' }));
  });
});
