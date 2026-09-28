import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DanosEditor, novoDanoVazio, type NovoDano } from './DanosEditor';
import { subirFotoDano, removerFotoDano } from '@/lib/fotosDano';

vi.mock('@/lib/fotosDano', () => ({
  subirFotoDano: vi.fn(),
  removerFotoDano: vi.fn().mockResolvedValue(undefined),
  urlFotoDano: vi.fn().mockResolvedValue(null),
}));

/** Controlado como nos ecrãs reais; expõe o estado das fotos para o teste ler. */
function Harness() {
  const [danos, setDanos] = useState<NovoDano[]>([{ ...novoDanoVazio(), descricao: 'Porta' }]);
  return (
    <>
      <DanosEditor danos={danos} onChange={setDanos} pastaUpload="rascunho/contrato-1" />
      <output data-testid="fotos">
        {JSON.stringify(danos[0]?.files.map((f) => [f.estado, f.path]) ?? [])}
      </output>
    </>
  );
}

function escolherFoto(nome = 'porta.jpg') {
  fireEvent.click(screen.getByRole('button', { name: /ficheiros/i }));
  const input = document.querySelector('input[type="file"]:not([capture])') as HTMLInputElement;
  const file = new File(['x'], nome, { type: 'image/jpeg' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

describe('DanosEditor — a foto sobe ao ser escolhida', () => {
  it('sobe para a pasta indicada e fica com o caminho do bucket', async () => {
    vi.mocked(subirFotoDano).mockResolvedValue('rascunho/contrato-1/1.jpg');
    render(<Harness />);
    const file = escolherFoto();

    await waitFor(() =>
      expect(screen.getByTestId('fotos')).toHaveTextContent(
        '["subido","rascunho/contrato-1/1.jpg"]'
      )
    );
    expect(subirFotoDano).toHaveBeenCalledWith('rascunho/contrato-1', file);
    expect(subirFotoDano).toHaveBeenCalledTimes(1);
  });

  it('se o upload falhar, a foto fica marcada com erro e não desaparece', async () => {
    vi.mocked(subirFotoDano).mockRejectedValue(new Error('rede'));
    render(<Harness />);
    escolherFoto();

    await waitFor(() => expect(screen.getByTestId('fotos')).toHaveTextContent('["erro",null]'));
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument();
  });

  it('tentar de novo volta a subir a mesma foto', async () => {
    vi.mocked(subirFotoDano)
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValueOnce('rascunho/contrato-1/2.jpg');
    render(<Harness />);
    escolherFoto();
    await waitFor(() => expect(screen.getByTestId('fotos')).toHaveTextContent('erro'));

    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    await waitFor(() =>
      expect(screen.getByTestId('fotos')).toHaveTextContent(
        '["subido","rascunho/contrato-1/2.jpg"]'
      )
    );
    expect(subirFotoDano).toHaveBeenCalledTimes(2);
  });

  it('remover uma foto já subida apaga-a do bucket', async () => {
    vi.mocked(subirFotoDano).mockResolvedValue('rascunho/contrato-1/3.jpg');
    render(<Harness />);
    escolherFoto('lado.jpg');
    await waitFor(() => expect(screen.getByTestId('fotos')).toHaveTextContent('subido'));

    fireEvent.click(screen.getByRole('button', { name: /remover lado\.jpg/i }));
    expect(removerFotoDano).toHaveBeenCalledWith('rascunho/contrato-1/3.jpg');
    expect(screen.getByTestId('fotos')).toHaveTextContent('[]');
  });
});
