import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentTemplateList } from './DocumentTemplateList';
import type { DocumentTemplate } from '@/types/documentTemplate';

const template: DocumentTemplate = {
  id: 't1',
  nome: 'Contrato TVDE',
  tipo: 'contrato_tvde',
  empresa_id: null,
  cliente_empresa_id: 'e1',
  template_data: {},
  campos_dinamicos: {},
  ativo: true,
  versao: 2,
  created_at: '2026-01-01T10:00:00Z',
  updated_at: '2026-01-02T10:00:00Z',
};

const handlers = {
  onEdit: vi.fn(),
  onDuplicate: vi.fn(),
  onToggleStatus: vi.fn(),
  onPreview: vi.fn(),
};

describe('DocumentTemplateList', () => {
  it('mostra estado vazio quando não há templates', () => {
    render(<DocumentTemplateList templates={[]} {...handlers} />);
    expect(screen.getByText(/nenhum template/i)).toBeTruthy();
  });

  it('lista o template com nome, empresa e versão', () => {
    render(
      <DocumentTemplateList
        templates={[template]}
        nomePorEmpresa={{ e1: 'Urbango' }}
        {...handlers}
      />
    );
    expect(screen.getByText('Contrato TVDE')).toBeTruthy();
    expect(screen.getByText(/Urbango/)).toBeTruthy();
    expect(screen.getByText(/Versão: 2/)).toBeTruthy();
    expect(screen.getByText('Ativo')).toBeTruthy();
  });

  it('chama onEdit e onToggleStatus com o template', () => {
    render(
      <DocumentTemplateList
        templates={[template]}
        nomePorEmpresa={{ e1: 'Urbango' }}
        {...handlers}
      />
    );
    fireEvent.click(screen.getByTitle('Editar'));
    expect(handlers.onEdit).toHaveBeenCalledWith(template);

    fireEvent.click(screen.getByTitle('Ativar/Desativar'));
    expect(handlers.onToggleStatus).toHaveBeenCalledWith(template);
  });
});
