import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { TiCompositor } from './TiCompositor';

function montar(onEnviar = vi.fn().mockResolvedValue(true)) {
  render(<TiCompositor onEnviar={onEnviar} isPending={false} />);
  return { onEnviar, caixa: screen.getByLabelText('Mensagem') as HTMLTextAreaElement };
}

describe('TiCompositor', () => {
  it('sem texto nem anexos, não deixa enviar', () => {
    montar();
    expect(screen.getByRole('button', { name: 'Enviar mensagem' })).toBeDisabled();
  });

  it('Enter envia e limpa a caixa; Shift+Enter não envia', async () => {
    const { onEnviar, caixa } = montar();
    fireEvent.change(caixa, { target: { value: '  Já reiniciei  ' } });

    fireEvent.keyDown(caixa, { key: 'Enter', shiftKey: true });
    expect(onEnviar).not.toHaveBeenCalled();

    fireEvent.keyDown(caixa, { key: 'Enter' });
    await waitFor(() => expect(onEnviar).toHaveBeenCalledWith('Já reiniciei', []));
    await waitFor(() => expect(caixa.value).toBe(''));
  });

  it('se o envio falha, o texto fica para tentar outra vez', async () => {
    const { onEnviar, caixa } = montar(vi.fn().mockResolvedValue(false));
    fireEvent.change(caixa, { target: { value: 'Olá' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar mensagem' }));

    await waitFor(() => expect(onEnviar).toHaveBeenCalled());
    expect(caixa.value).toBe('Olá');
  });

  it('recusa um tipo de ficheiro não suportado', () => {
    const { container } = render(<TiCompositor onEnviar={vi.fn()} isPending={false} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'virus.exe', { type: 'application/x-msdownload' })] },
    });
    expect(screen.getByText(/Tipo de ficheiro não suportado/)).toBeInTheDocument();
    expect(screen.queryByText('virus.exe')).toBeNull();
  });

  it('colar um print na caixa anexa-o; colar texto não', () => {
    const { caixa } = montar();
    const print = new File(['x'], 'image.png', { type: 'image/png' });
    fireEvent.paste(caixa, { clipboardData: { files: [print], getData: () => '' } });
    expect(screen.getByText(/^print-\d{6}\.png$/)).toBeInTheDocument();

    fireEvent.paste(caixa, { clipboardData: { files: [], getData: () => 'só texto' } });
    expect(screen.getAllByRole('button', { name: /^Remover/ })).toHaveLength(1);
  });
});
