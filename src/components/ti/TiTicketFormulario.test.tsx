import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { TiTicketFormulario } from './TiTicketFormulario';
import { supabase } from '@/integrations/supabase/client';

function preencher() {
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Bruno Paulo' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bruno@exemplo.pt' } });
  fireEvent.change(screen.getByLabelText('Qual é o problema?'), {
    target: { value: 'O portátil não liga' },
  });
}

function ficheiro(nome: string, tipo: string, conteudo = 'x') {
  return new File([conteudo], nome, { type: tipo });
}

function selecionarFicheiro(file: File) {
  const input = document.getElementById('ti-anexos') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('TiTicketFormulario', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submete sem anexos quando nenhum é escolhido', async () => {
    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, numero: 7, anexosFalhou: false },
      error: null,
    });

    render(<TiTicketFormulario token="tok-1" />);
    preencher();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));

    await waitFor(() => expect(screen.getByText('Pedido #7 registado')).toBeInTheDocument());
    expect(supabase.functions.invoke).toHaveBeenCalledWith('ti-ticket-submeter', {
      body: {
        token: 'tok-1',
        nome: 'Bruno Paulo',
        email: 'bruno@exemplo.pt',
        descricao: 'O portátil não liga',
        anexos: [],
      },
    });
  });

  it('mostra o ficheiro escolhido na lista e permite removê-lo', () => {
    render(<TiTicketFormulario token="tok-1" />);
    selecionarFicheiro(ficheiro('foto.png', 'image/png'));

    expect(screen.getByText('foto.png')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remover foto.png' }));
    expect(screen.queryByText('foto.png')).toBeNull();
  });

  it('rejeita um tipo de ficheiro não suportado sem o adicionar à lista', () => {
    render(<TiTicketFormulario token="tok-1" />);
    selecionarFicheiro(ficheiro('virus.exe', 'application/x-msdownload'));

    expect(screen.queryByText('virus.exe')).toBeNull();
    expect(screen.getByText(/Tipo de ficheiro não suportado/)).toBeInTheDocument();
  });

  it('envia o anexo em base64 dentro do pedido de submissão', async () => {
    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, numero: 8, anexosFalhou: false },
      error: null,
    });

    render(<TiTicketFormulario token="tok-1" />);
    preencher();
    selecionarFicheiro(ficheiro('foto.png', 'image/png', 'conteudo'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));

    await waitFor(() => expect(supabase.functions.invoke).toHaveBeenCalled());
    const chamada = (supabase.functions.invoke as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(chamada.body.anexos).toHaveLength(1);
    expect(chamada.body.anexos[0]).toMatchObject({ nome: 'foto.png', mimeType: 'image/png' });
    expect(typeof chamada.body.anexos[0].conteudoBase64).toBe('string');
    expect(chamada.body.anexos[0].conteudoBase64.length).toBeGreaterThan(0);
  });

  // Distinguir "registado" de "registado e tudo o resto correu bem" — sem
  // isto, quem anexou um ficheiro que falhou a gravar pensava que estava lá.
  it('avisa quando o pedido regista mas os anexos falham a gravar', async () => {
    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: true, numero: 9, anexosFalhou: true },
      error: null,
    });

    render(<TiTicketFormulario token="tok-1" />);
    preencher();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));

    await waitFor(() => expect(screen.getByText('Pedido #9 registado')).toBeInTheDocument());
    expect(screen.getByText(/não foi possível guardar os ficheiros anexados/)).toBeInTheDocument();
  });

  it('mostra o erro do servidor quando a submissão falha', async () => {
    (supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { success: false, error: 'Este link já não é válido.' },
      error: null,
    });

    render(<TiTicketFormulario token="tok-1" />);
    preencher();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));

    await waitFor(() => expect(screen.getByText('Este link já não é válido.')).toBeInTheDocument());
  });
});
