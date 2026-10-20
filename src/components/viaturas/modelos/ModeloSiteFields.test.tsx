import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { upload, remove, ordem } = vi.hoisted(() => ({
  upload: vi.fn(),
  remove: vi.fn(),
  ordem: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => {
          ordem.push('upload');
          return upload(...a);
        },
        remove: (...a: unknown[]) => {
          ordem.push('remove');
          return remove(...a);
        },
        getPublicUrl: (caminho: string) => ({
          data: {
            publicUrl: `https://abc.supabase.co/storage/v1/object/public/modelos-viaturas/${caminho}`,
          },
        }),
      }),
    },
  },
}));

import { ModeloSiteFields } from './ModeloSiteFields';
import { modeloSiteVazio } from './modeloSite.schema';

function carregar(tipo = 'image/webp') {
  const onChange = vi.fn();
  render(<ModeloSiteFields value={modeloSiteVazio} onChange={onChange} modeloId="m1" orgId="o1" />);
  const ficheiro = new File(['x'], 'foto', { type: tipo });
  fireEvent.change(screen.getByLabelText('Foto do modelo'), { target: { files: [ficheiro] } });
  return onChange;
}

beforeEach(() => {
  upload.mockReset();
  remove.mockReset();
  ordem.length = 0;
});

describe('foto do modelo', () => {
  it('carrega e depois remove as fotos antigas com outra extensão', async () => {
    upload.mockResolvedValue({ error: null });
    remove.mockResolvedValue({ error: null });
    const onChange = carregar('image/webp');
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(upload.mock.calls[0][0]).toBe('o1/m1.webp');
    expect(remove).toHaveBeenCalledWith(['o1/m1.jpg', 'o1/m1.jpeg', 'o1/m1.png']);
    expect(ordem).toEqual(['upload', 'remove']);
    expect(onChange.mock.calls[0][0].imagem_url).toMatch(
      /^https:\/\/abc\.supabase\.co\/storage\/v1\/object\/public\/modelos-viaturas\/o1\/m1\.webp\?v=\d+$/
    );
  });

  it('upload falhado não apaga nada', async () => {
    upload.mockResolvedValue({ error: { message: 'quota' } });
    carregar();
    expect(await screen.findByText('quota')).toBeTruthy();
    expect(remove).not.toHaveBeenCalled();
  });

  it('remove falhado não estraga a foto nova (best-effort)', async () => {
    upload.mockResolvedValue({ error: null });
    remove.mockResolvedValue({ error: { message: 'sem permissão' } });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const onChange = carregar('image/png');
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls[0][0].imagem_url).toContain('/o1/m1.png?v=');
  });
});

describe('arrastar a foto', () => {
  const zona = () => screen.getByRole('button', { name: /Arraste a foto para aqui/ });
  const largar = (ficheiro: File) =>
    fireEvent.drop(zona(), { dataTransfer: { files: [ficheiro] } });

  it('largar uma imagem carrega-a como se fosse escolhida', async () => {
    upload.mockResolvedValue({ error: null });
    remove.mockResolvedValue({ error: null });
    const onChange = vi.fn();
    render(
      <ModeloSiteFields value={modeloSiteVazio} onChange={onChange} modeloId="m1" orgId="o1" />
    );
    largar(new File(['x'], 'duster.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(upload.mock.calls[0][0]).toBe('o1/m1.jpg');
  });

  it('largar um PDF mostra o erro e não carrega nada', async () => {
    render(
      <ModeloSiteFields value={modeloSiteVazio} onChange={vi.fn()} modeloId="m1" orgId="o1" />
    );
    largar(new File(['x'], 'dua.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('Use JPEG, PNG ou WebP.')).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
  });

  it('com foto, a zona mostra-a e pede outra para a substituir', () => {
    const url = 'https://abc.supabase.co/storage/v1/object/public/modelos-viaturas/o1/m1.webp?v=1';
    render(
      <ModeloSiteFields
        value={{ ...modeloSiteVazio, imagem_url: url }}
        onChange={vi.fn()}
        modeloId="m1"
        orgId="o1"
      />
    );
    expect(screen.getByRole('img', { name: 'Foto do modelo para o site' })).toHaveProperty(
      'src',
      url
    );
    expect(
      screen.getByRole('button', { name: /Arraste outra foto para a substituir/ })
    ).toBeTruthy();
  });

  it('modelo novo: sem zona, pede para guardar primeiro', () => {
    render(
      <ModeloSiteFields value={modeloSiteVazio} onChange={vi.fn()} modeloId={null} orgId="o1" />
    );
    expect(screen.queryByRole('button', { name: /Arraste/ })).toBeNull();
    expect(screen.getByText('Guarde o modelo primeiro para carregar a foto.')).toBeTruthy();
  });
});
