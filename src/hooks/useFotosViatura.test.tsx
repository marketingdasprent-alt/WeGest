import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { useAdicionarFotosViatura, useReordenarFotosViatura } from './useFotosViatura';
import { reduzirImagem } from '@/lib/imagemReduzida';
import { caminhoDaCapa } from './useCapasViaturas';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u-1' } }) }));
vi.mock('@/lib/imagemReduzida', () => ({ reduzirImagem: vi.fn() }));

const upload = vi.fn();
const remove = vi.fn();
const insert = vi.fn();
const rpc = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  upload.mockResolvedValue({ data: {}, error: null });
  remove.mockResolvedValue({ data: {}, error: null });
  insert.mockResolvedValue({ error: null });
  rpc.mockResolvedValue({ error: null });
  vi.mocked(reduzirImagem).mockImplementation(async () => new Blob(['x'], { type: 'image/jpeg' }));
  (supabase as unknown as { storage: unknown }).storage = { from: () => ({ upload, remove }) };
  (supabase as unknown as { from: unknown }).from = vi.fn(() => ({ insert }));
  (supabase as unknown as { rpc: unknown }).rpc = rpc;
});

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const img = (nome: string) => new File(['x'], nome, { type: 'image/jpeg' });

describe('useAdicionarFotosViatura', () => {
  it('sobe foto + miniatura e grava a linha como foto, pela ordem escolhida', async () => {
    const { result } = renderHook(() => useAdicionarFotosViatura('v-1', 0), { wrapper: wrapper() });
    await result.current.mutateAsync([img('a.jpg'), img('b.jpg')]);

    expect(upload).toHaveBeenCalledTimes(4);
    expect(upload.mock.calls[0][0]).toMatch(/^v-1\/fotos\/.+\.jpg$/);
    expect(upload.mock.calls[1][0]).toMatch(/_mini\.jpg$/);
    expect(insert.mock.calls.map((c) => c[0].nome_ficheiro)).toEqual(['a.jpg', 'b.jpg']);
    expect(insert.mock.calls[0][0]).toMatchObject({
      viatura_id: 'v-1',
      tipo_documento: 'foto',
      uploaded_by: 'u-1',
    });
    expect(insert.mock.calls[0][0].miniatura_url).toMatch(/_mini\.jpg$/);
  });

  it('com 7 fotos, de 3 escolhidas só entra 1 — o resto fica de fora', async () => {
    const { result } = renderHook(() => useAdicionarFotosViatura('v-1', 7), { wrapper: wrapper() });
    const r = await result.current.mutateAsync([img('a.jpg'), img('b.jpg'), img('c.jpg')]);
    expect(r).toEqual({ adicionadas: 1, ignoradas: 2 });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('cheia: recusa sem subir nada', async () => {
    const { result } = renderHook(() => useAdicionarFotosViatura('v-1', 8), { wrapper: wrapper() });
    await expect(result.current.mutateAsync([img('a.jpg')])).rejects.toThrow(/8 fotos/);
    expect(upload).not.toHaveBeenCalled();
  });

  it('ignora o que não é imagem', async () => {
    const { result } = renderHook(() => useAdicionarFotosViatura('v-1', 0), { wrapper: wrapper() });
    const pdf = new File(['x'], 'fatura.pdf', { type: 'application/pdf' });
    await expect(result.current.mutateAsync([pdf])).rejects.toThrow(/imagens/);
  });

  it('se o browser não ler o formato, sobe o original sem miniatura', async () => {
    vi.mocked(reduzirImagem).mockRejectedValue(new Error('HEIC'));
    const { result } = renderHook(() => useAdicionarFotosViatura('v-1', 0), { wrapper: wrapper() });
    const heic = new File(['x'], 'carro.heic', { type: 'image/heic' });
    await result.current.mutateAsync([heic]);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][1]).toBe(heic);
    expect(insert.mock.calls[0][0].miniatura_url).toBeNull();
  });

  it('se a linha falhar (ex.: limite na base), apaga os ficheiros que subiram', async () => {
    insert.mockResolvedValue({ error: { message: 'Esta viatura já tem 8 fotos' } });
    const { result } = renderHook(() => useAdicionarFotosViatura('v-1', 0), { wrapper: wrapper() });
    await expect(result.current.mutateAsync([img('a.jpg')])).rejects.toBeTruthy();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0][0]).toHaveLength(2);
  });
});

describe('useReordenarFotosViatura', () => {
  it('manda a sequência inteira à RPC', async () => {
    const { result } = renderHook(() => useReordenarFotosViatura('v-1'), { wrapper: wrapper() });
    result.current.mutate(['c', 'a', 'b']);
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith('reordenar_fotos_viatura', {
      p_viatura_id: 'v-1',
      p_ids: ['c', 'a', 'b'],
    });
  });
});

describe('caminhoDaCapa', () => {
  it('na lista usa a miniatura; sem miniatura, a foto', () => {
    const mapa = caminhoDaCapa([
      { viatura_id: 'v-1', ficheiro_url: 'v-1/fotos/a.jpg', miniatura_url: 'v-1/fotos/a_mini.jpg' },
      { viatura_id: 'v-2', ficheiro_url: 'v-2/fotos/b.heic', miniatura_url: null },
    ]);
    expect(mapa.get('v-1')).toBe('v-1/fotos/a_mini.jpg');
    expect(mapa.get('v-2')).toBe('v-2/fotos/b.heic');
  });
});
