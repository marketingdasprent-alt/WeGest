// src/components/admin/DocumentoSuplementarDialog.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DocumentoSuplementarDialog } from './DocumentoSuplementarDialog';
import type { DocumentoSuplementarComEmpresas } from '@/types/documentoSuplementar';

const createMutateAsync = vi.fn().mockResolvedValue(undefined);
const updateMutateAsync = vi.fn().mockResolvedValue(undefined);
vi.mock('@/hooks/useDocumentosSuplementares', () => ({
  useCreateDocumentoSuplementar: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateDocumentoSuplementar: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
}));

vi.mock('@/hooks/useClientesEmpresas', () => ({
  useClientesEmpresas: () => ({
    empresas: [
      { id: 'e1', nome: 'Urbango' },
      { id: 'e2', nome: 'Década Ousada' },
    ],
  }),
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const documentoExistente: DocumentoSuplementarComEmpresas = {
  id: 'd1',
  nome: 'Norma Interna',
  ficheiro_url: 'path1',
  ficheiro_nome: 'norma.pdf',
  mime_type: 'application/pdf',
  tamanho_bytes: 1000,
  ativo: true,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  empresaIds: ['e1'],
};

const file = new File(['conteudo'], 'nova-norma.pdf', { type: 'application/pdf' });

describe('DocumentoSuplementarDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('criar: submete nome, ficheiro e empresas selecionadas', async () => {
    render(<DocumentoSuplementarDialog open documento={null} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Norma X' } });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.click(screen.getByLabelText('Urbango'));

    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() =>
      expect(createMutateAsync).toHaveBeenCalledWith({ nome: 'Norma X', file, empresaIds: ['e1'] })
    );
  });

  it('editar: pré-preenche nome e empresas, e chama update sem novo ficheiro', async () => {
    render(<DocumentoSuplementarDialog open documento={documentoExistente} onOpenChange={vi.fn()} />);

    expect(screen.getByLabelText('Nome')).toHaveValue('Norma Interna');
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() =>
      expect(updateMutateAsync).toHaveBeenCalledWith({
        id: 'd1',
        nome: 'Norma Interna',
        ativo: true,
        empresaIds: ['e1'],
        file: undefined,
        ficheiroUrlAtual: 'path1',
      })
    );
  });

  it('criar: bloqueia sem ficheiro selecionado', async () => {
    const { toast } = await import('sonner');
    render(<DocumentoSuplementarDialog open documento={null} onOpenChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Norma X' } });
    fireEvent.click(screen.getByLabelText('Urbango'));
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(createMutateAsync).not.toHaveBeenCalled();
  });
});
