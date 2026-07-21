import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContactModal } from './ContactModal';
import { supabase } from '@/integrations/supabase/client';

function openModal() {
  fireEvent.click(screen.getByRole('button', { name: 'Fale connosco' }));
}

function fillForm() {
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Maria Silva' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'maria@empresa.pt' } });
  fireEvent.change(screen.getByLabelText('Mensagem'), {
    target: { value: 'Gostaria de saber mais sobre o WeGest.' },
  });
}

describe('ContactModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não mostra o formulário antes de o modal ser aberto', () => {
    render(<ContactModal trigger={<button type="button">Fale connosco</button>} />);

    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('abre o formulário ao clicar no trigger', () => {
    render(<ContactModal trigger={<button type="button">Fale connosco</button>} />);

    openModal();

    expect(screen.getByLabelText('Nome')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByLabelText('Mensagem')).toBeTruthy();
  });

  it('envia os dados do formulário para a edge function e fecha o modal ao ter sucesso', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: true },
      error: null,
    } as never);

    render(<ContactModal trigger={<button type="button">Fale connosco</button>} />);

    openModal();
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith('contact-inquiry', {
        body: {
          nome: 'Maria Silva',
          email: 'maria@empresa.pt',
          empresa: '',
          mensagem: 'Gostaria de saber mais sobre o WeGest.',
          website: '',
        },
      });
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Email')).toBeNull();
    });
  });

  it('mantém o modal aberto quando a edge function falha', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: false, error: 'Email inválido' },
      error: null,
    } as never);

    render(<ContactModal trigger={<button type="button">Fale connosco</button>} />);

    openModal();
    fillForm();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalled();
    });

    expect(screen.getByLabelText('Email')).toBeTruthy();
  });
});
