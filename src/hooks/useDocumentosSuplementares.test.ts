import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import {
  useDocumentosSuplementares,
  useCreateDocumentoSuplementar,
  useUpdateDocumentoSuplementar,
  useRemoveDocumentoSuplementar,
  getDocumentoSuplementarSignedUrl,
} from './useDocumentosSuplementares';
import { supabase } from '@/integrations/supabase/client';

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const spy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { wrapper, spy };
}

function mockStorage() {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const createSignedUrl = vi
    .fn()
    .mockResolvedValue({ data: { signedUrl: 'https://signed.example/doc.pdf' }, error: null });
  (supabase as unknown as { storage: unknown }).storage = {
    from: vi.fn().mockReturnValue({ upload, remove, createSignedUrl }),
  };
  return { upload, remove, createSignedUrl };
}

const file = new File(['conteudo'], 'norma.pdf', { type: 'application/pdf' });

describe('useDocumentosSuplementares', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lista documentos com as empresas associadas resolvidas', async () => {
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            id: 'd1',
            nome: 'Norma X',
            ficheiro_url: 'path1',
            ficheiro_nome: 'norma.pdf',
            mime_type: 'application/pdf',
            tamanho_bytes: 1000,
            ativo: true,
            created_at: '2026-01-01',
            updated_at: '2026-01-01',
            documento_suplementar_empresas: [
              { cliente_empresa_id: 'e1' },
              { cliente_empresa_id: 'e2' },
            ],
          },
        ],
        error: null,
      }),
    };
    (supabase.from as any).mockReturnValue(chain);
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useDocumentosSuplementares(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].empresaIds).toEqual(['e1', 'e2']);
    expect(supabase.from).toHaveBeenCalledWith('documentos_suplementares');
  });

  it('cria: valida ficheiro, faz upload, insere linha e associações', async () => {
    const { upload } = mockStorage();
    const insertChain: any = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'novo-id' }, error: null }),
    };
    const junctionChain: any = { insert: vi.fn().mockResolvedValue({ error: null }) };
    (supabase.from as any).mockImplementation((table: string) =>
      table === 'documentos_suplementares' ? insertChain : junctionChain
    );
    const { wrapper, spy } = makeWrapper();

    const { result } = renderHook(() => useCreateDocumentoSuplementar(), { wrapper });
    result.current.mutate({ nome: 'Norma X', file, empresaIds: ['e1', 'e2'] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(upload).toHaveBeenCalled();
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ nome: 'Norma X', ficheiro_nome: 'norma.pdf' })
    );
    expect(junctionChain.insert).toHaveBeenCalledWith([
      { documento_id: 'novo-id', cliente_empresa_id: 'e1' },
      { documento_id: 'novo-id', cliente_empresa_id: 'e2' },
    ]);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['documentos-suplementares'] });
  });

  it('cria: rejeita ficheiro com MIME não suportado sem chamar o storage', async () => {
    const { upload } = mockStorage();
    (supabase.from as any).mockReturnValue({ insert: vi.fn().mockReturnThis() });
    const { wrapper } = makeWrapper();
    const bad = new File(['x'], 'virus.exe', { type: 'application/x-msdownload' });

    const { result } = renderHook(() => useCreateDocumentoSuplementar(), { wrapper });
    result.current.mutate({ nome: 'X', file: bad, empresaIds: ['e1'] });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(upload).not.toHaveBeenCalled();
  });

  it('atualiza: sincroniza empresas por diferença (apaga removidas, insere novas)', async () => {
    const updateChain: any = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    const selectChain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [
          { id: 'j1', cliente_empresa_id: 'e1' },
          { id: 'j2', cliente_empresa_id: 'e2' },
        ],
        error: null,
      }),
    };
    const deleteChain: any = {
      delete: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ error: null }),
    };
    const insertChain: any = { insert: vi.fn().mockResolvedValue({ error: null }) };

    let callCount = 0;
    (supabase.from as any).mockImplementation((table: string) => {
      if (table === 'documentos_suplementares') return updateChain;
      // documento_suplementar_empresas: 1ª chamada = select actuais, 2ª = delete, 3ª = insert
      callCount += 1;
      if (callCount === 1) return selectChain;
      if (deleteChain.delete.mock.calls.length === 0) return deleteChain;
      return insertChain;
    });
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useUpdateDocumentoSuplementar(), { wrapper });
    result.current.mutate({
      id: 'd1',
      nome: 'Norma X',
      ativo: true,
      empresaIds: ['e1', 'e3'],
      ficheiroUrlAtual: 'path1',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deleteChain.in).toHaveBeenCalledWith('id', ['j2']);
    expect(insertChain.insert).toHaveBeenCalledWith([
      { documento_id: 'd1', cliente_empresa_id: 'e3' },
    ]);
  });

  it('elimina: apaga a linha e remove o ficheiro do storage (best-effort)', async () => {
    const { remove } = mockStorage();
    const deleteChain: any = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    (supabase.from as any).mockReturnValue(deleteChain);
    const { wrapper } = makeWrapper();

    const doc = {
      id: 'd1',
      nome: 'Norma X',
      ficheiro_url: 'path1',
      ficheiro_nome: 'norma.pdf',
      mime_type: 'application/pdf',
      tamanho_bytes: 1000,
      ativo: true,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    };

    const { result } = renderHook(() => useRemoveDocumentoSuplementar(), { wrapper });
    result.current.mutate(doc);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deleteChain.eq).toHaveBeenCalledWith('id', 'd1');
    expect(remove).toHaveBeenCalledWith(['path1']);
  });

  it('getDocumentoSuplementarSignedUrl: devolve a URL assinada', async () => {
    mockStorage();
    const url = await getDocumentoSuplementarSignedUrl('path1');
    expect(url).toBe('https://signed.example/doc.pdf');
  });
});
