import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResumoActionBar } from './ResumoActionBar';

const handlers = {
  onClose: vi.fn(),
  onSendWhatsApp: vi.fn(),
  onOpenEmail: vi.fn(),
  onSendAccount: vi.fn(),
  onPrint: vi.fn(),
};

function renderBar(isSending = false) {
  return render(<ResumoActionBar isSending={isSending} {...handlers} />);
}

beforeEach(() => vi.clearAllMocks());

describe('ResumoActionBar', () => {
  it('"Enviar" dispara o WhatsApp num clique, sem passar por menu nenhum', () => {
    // Era aqui que estava o atrito: o caminho usado todos os dias custava dois
    // cliques e um menu, ao lado de duas opções que quase ninguém escolhe.
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: /enviar/i }));
    expect(handlers.onSendWhatsApp).toHaveBeenCalledTimes(1);
  });

  it('não mostra Email nem Enviar à Conta até se abrir as mais opções', () => {
    renderBar();
    expect(screen.queryByText('Email')).toBeNull();
    expect(screen.queryByText('Enviar à Conta')).toBeNull();
    expect(screen.getByRole('button', { name: /mais op(ç|c)ões/i })).toBeTruthy();
  });

  it('enquanto envia, o botão fica bloqueado para não duplicar o envio', () => {
    renderBar(true);
    const enviar = screen.getByRole('button', { name: /enviar/i }) as HTMLButtonElement;
    expect(enviar.disabled).toBe(true);
    fireEvent.click(enviar);
    expect(handlers.onSendWhatsApp).not.toHaveBeenCalled();
  });

  it('fechar e imprimir continuam a funcionar', () => {
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: /fechar/i }));
    fireEvent.click(screen.getByRole('button', { name: /imprimir/i }));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    expect(handlers.onPrint).toHaveBeenCalledTimes(1);
  });
});
