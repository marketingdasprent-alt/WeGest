// src/components/admin/DocumentoSuplementarList.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentoSuplementarList } from './DocumentoSuplementarList';
import { supabase } from '@/integrations/supabase/client';
import type { DocumentoSuplementarComEmpresas } from '@/types/documentoSuplementar';

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

const doc: DocumentoSuplementarComEmpresas = {
  id: 'd1',
  nome: 'Norma Interna',
  ficheiro_url: 'path1',
  ficheiro_nome: 'norma.pdf',
  mime_type: 'application/pdf',
  tamanho_bytes: 204800,
  ativo: true,
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-01T10:00:00Z',
  empresaIds: ['e1', 'e2'],
};

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('DocumentoSuplementarList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.open = vi.fn();
  });

  it('mostra estado vazio quando não há documentos', () => {
    renderWithClient(
      <DocumentoSuplementarList
        documentos={[]}
        nomePorEmpresa={{}}
        isLoading={false}
        onEdit={vi.fn()}
      />
    );
    expect(screen.getByText(/nenhum documento suplementar/i)).toBeTruthy();
  });

  it('lista o documento com nome e badges de empresa', () => {
    renderWithClient(
      <DocumentoSuplementarList
        documentos={[doc]}
        nomePorEmpresa={{ e1: 'Urbango', e2: 'Década Ousada' }}
        isLoading={false}
        onEdit={vi.fn()}
      />
    );
    expect(screen.getByText('Norma Interna')).toBeTruthy();
    expect(screen.getByText('Urbango')).toBeTruthy();
    expect(screen.getByText('Década Ousada')).toBeTruthy();
  });

  it('chama onEdit ao clicar em Editar', () => {
    const onEdit = vi.fn();
    renderWithClient(
      <DocumentoSuplementarList
        documentos={[doc]}
        nomePorEmpresa={{}}
        isLoading={false}
        onEdit={onEdit}
      />
    );
    fireEvent.click(screen.getByTitle('Editar'));
    expect(onEdit).toHaveBeenCalledWith(doc);
  });

  it('descarregar: gera URL assinada e abre em nova aba', async () => {
    (supabase as unknown as { storage: unknown }).storage = {
      from: vi.fn().mockReturnValue({
        createSignedUrl: vi.fn().mockResolvedValue({
          data: { signedUrl: 'https://signed.example/norma.pdf' },
          error: null,
        }),
      }),
    };
    renderWithClient(
      <DocumentoSuplementarList
        documentos={[doc]}
        nomePorEmpresa={{}}
        isLoading={false}
        onEdit={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTitle('Descarregar'));
    await waitFor(() =>
      expect(window.open).toHaveBeenCalledWith(
        'https://signed.example/norma.pdf',
        '_blank',
        'noopener,noreferrer'
      )
    );
  });

  it('eliminar: pede confirmação e chama o delete no Supabase ao confirmar', async () => {
    const deleteChain: any = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    (supabase.from as any).mockReturnValue(deleteChain);
    (supabase as unknown as { storage: unknown }).storage = {
      from: vi.fn().mockReturnValue({ remove: vi.fn().mockResolvedValue({ error: null }) }),
    };
    renderWithClient(
      <DocumentoSuplementarList
        documentos={[doc]}
        nomePorEmpresa={{}}
        isLoading={false}
        onEdit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTitle('Eliminar'));
    fireEvent.click(await screen.findByRole('button', { name: /^eliminar$/i }));

    await waitFor(() => expect(deleteChain.eq).toHaveBeenCalledWith('id', 'd1'));
  });
});
