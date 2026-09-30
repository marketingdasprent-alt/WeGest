import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ViaturaTabFotos } from './ViaturaTabFotos';
import {
  useAdicionarFotosViatura,
  useFotosViatura,
  useRemoverFotoViatura,
  useReordenarFotosViatura,
  type FotoViatura,
} from '@/hooks/useFotosViatura';

vi.mock('@/hooks/useFotosViatura', () => ({
  useFotosViatura: vi.fn(),
  useAdicionarFotosViatura: vi.fn(),
  useReordenarFotosViatura: vi.fn(),
  useRemoverFotoViatura: vi.fn(),
}));

const podeEditar = { valor: true };
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ canEdit: () => podeEditar.valor }),
}));

const reordenarMutate = vi.fn();
const adicionarMutate = vi.fn();

const foto = (id: string): FotoViatura => ({
  id,
  nome: `${id}.jpg`,
  path: `v/fotos/${id}.jpg`,
  miniaturaPath: `v/fotos/${id}_mini.jpg`,
  url: `https://x/${id}.jpg`,
  miniaturaUrl: `https://x/${id}_mini.jpg`,
});

function montar(fotos: FotoViatura[], estado: { isLoading?: boolean; error?: unknown } = {}) {
  vi.mocked(useFotosViatura).mockReturnValue({
    data: fotos,
    isLoading: false,
    error: null,
    ...estado,
  } as unknown as ReturnType<typeof useFotosViatura>);
  vi.mocked(useAdicionarFotosViatura).mockReturnValue({
    mutate: adicionarMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useAdicionarFotosViatura>);
  vi.mocked(useReordenarFotosViatura).mockReturnValue({
    mutate: reordenarMutate,
  } as unknown as ReturnType<typeof useReordenarFotosViatura>);
  vi.mocked(useRemoverFotoViatura).mockReturnValue({
    mutate: vi.fn(),
  } as unknown as ReturnType<typeof useRemoverFotoViatura>);
  return render(<ViaturaTabFotos viaturaId="v-1" />);
}

beforeEach(() => {
  vi.clearAllMocks();
  podeEditar.valor = true;
});

describe('ViaturaTabFotos', () => {
  it('mostra o contador e marca a primeira como capa', () => {
    montar([foto('a'), foto('b'), foto('c')]);
    expect(screen.getByText('3/8')).toBeInTheDocument();
    expect(screen.getByText('Capa')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /definir como capa/i })).toHaveLength(2);
  });

  it('definir capa manda a escolhida para a frente, o resto pela mesma ordem', () => {
    montar([foto('a'), foto('b'), foto('c')]);
    fireEvent.click(screen.getAllByRole('button', { name: /definir como capa/i })[1]);
    expect(reordenarMutate).toHaveBeenCalledWith(['c', 'a', 'b']);
  });

  it('com 8 fotos a zona de adicionar fica desligada', () => {
    montar(['1', '2', '3', '4', '5', '6', '7', '8'].map(foto));
    expect(screen.getByText(/já tem o máximo de fotos/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /escolher fotos/i })).toBeDisabled();
  });

  it('largar ficheiros na zona entrega-os para upload', () => {
    montar([]);
    const zona = screen.getByText(/arraste fotos para aqui/i).parentElement!;
    const file = new File(['x'], 'lado.jpg', { type: 'image/jpeg' });
    fireEvent.drop(zona, { dataTransfer: { files: [file], types: ['Files'] } });
    expect(adicionarMutate).toHaveBeenCalledWith([file]);
  });

  it('sem permissão de editar: vê as fotos, não as muda', () => {
    podeEditar.valor = false;
    montar([foto('a'), foto('b')]);
    expect(screen.queryByRole('button', { name: /definir como capa/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /remover foto/i })).toBeNull();
    expect(screen.queryByText(/arraste fotos/i)).toBeNull();
  });

  it('erro a carregar diz que falhou, em vez de mostrar uma galeria vazia', () => {
    montar([], { error: new Error('x') });
    expect(screen.getByText(/não foi possível carregar as fotos/i)).toBeInTheDocument();
  });
});
