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
