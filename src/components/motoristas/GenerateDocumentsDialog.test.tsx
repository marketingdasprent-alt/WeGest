import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// ── Mocks (hoisted) ──────────────────────────────────────────────────────────

// PDF combinado falso com um modelo de páginas a sério: cada página é uma lista
// do conteúdo que lhe foi escrito. É isto que permite afirmar em que página
// ficou cada documento, em vez de contar chamadas a addPage/deletePage e
// esperar que a contagem signifique o que se pensa.
class FakePdf {
  paginas: string[][] = [[]];
  atual = 0;
  save = vi.fn();

  addPage() {
    this.paginas.push([]);
    this.atual = this.paginas.length - 1;
  }

  deletePage(n: number) {
    this.paginas.splice(n - 1, 1);
    this.atual = Math.min(this.atual, this.paginas.length - 1);
  }

  getNumberOfPages() {
    return this.paginas.length;
  }

  /** Simula um documento a ser desenhado na página corrente. */
  escrever(conteudo: string) {
    this.paginas[this.atual].push(conteudo);
  }
}

const { pdfsCriados } = vi.hoisted(() => ({ pdfsCriados: [] as unknown[] }));

vi.mock('jspdf', () => ({
  default: vi.fn(() => {
    const p = new FakePdf();
    pdfsCriados.push(p);
    return p;
  }),
}));

const TEMPLATES = [
  {
    id: 'tpl-1',
    nome: 'Contrato Prestação',
    tipo: 'contrato_tvde',
    cliente_empresa_id: 'emp-1',
    empresa_id: null,
  },
  {
    id: 'tpl-2',
    nome: 'Contrato Aluguer',
    tipo: 'contrato_tvde',
    cliente_empresa_id: 'emp-1',
    empresa_id: null,
  },
];

vi.mock('@/integrations/supabase/client', () => {
  const methods = [
    'select',
    'eq',
    'neq',
    'not',
    'is',
    'lte',
    'gte',
    'in',
    'order',
    'or',
    'single',
    'maybeSingle',
    'limit',
    'range',
    'insert',
    'update',
    'delete',
    'upsert',
  ];

  function createChainable(result: Record<string, unknown>): Promise<typeof result> {
    const p = Promise.resolve(result);
    for (const m of methods) {
      (p as unknown as Record<string, unknown>)[m] = vi.fn(() => p);
    }
    return p;
  }

  return {
    supabase: {
      from: vi.fn((table: string) =>
        table === 'document_templates'
          ? createChainable({ data: TEMPLATES, error: null })
          : createChainable({ data: null, error: null })
      ),
      rpc: vi.fn(() => createChainable({ data: null, error: null })),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      },
    },
  };
});

vi.mock('@/hooks/useClientesEmpresas', () => {
  const empresas = [{ id: 'emp-1', nome: 'Empresa A' }];
  return {
    useClientesEmpresas: () => ({ empresas, getById: () => empresas[0] }),
  };
});

vi.mock('@/hooks/useDocumentosSuplementares', () => ({
  useDocumentosSuplementares: () => ({ data: [] }),
  getDocumentoSuplementarSignedUrl: vi.fn(),
}));

vi.mock('@/hooks/useEstacoes', () => {
  const estacoes = [{ id: 'est-1', nome: 'Leiria', cidade: 'Leiria', ativa: true }];
  return { useEstacoes: () => ({ data: estacoes }) };
});

vi.mock('@/hooks/useContratos', () => ({
  gerarContratoAtomico: vi.fn().mockResolvedValue({ id: 'contrato-1', is_existing: false }),
}));

vi.mock('@/utils/document-template/resolveCartaoFrota', () => ({
  resolveCartaoFrota: vi
    .fn()
    .mockResolvedValue({ marca: '', numero: '', validade: '', limite: '' }),
}));

// O gerador real escreve na página CORRENTE do PDF recebido — nunca cria uma
// página para si próprio (ver generate-document.ts: `startPage =
// pdf.getNumberOfPages()` e o comentário sobre documentos de continuação). O
// mock reproduz exactamente esse contrato: sem isso o teste não conseguiria
// distinguir "a página 1 é do primeiro documento" de "a página 1 está vazia".
vi.mock('@/utils/generateDocumentFromTemplate', () => ({
  generateDocumentFromTemplate: vi.fn(
    async ({ templateId, existingPdf }: { templateId: string; existingPdf?: FakePdf }) => {
      existingPdf?.escrever(templateId);
    }
  ),
  uploadDocumentToStorage: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/printPdf', () => ({ printPdf: vi.fn() }));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

// ── Imports (após mocks) ─────────────────────────────────────────────────────

import { GenerateDocumentsDialog } from './GenerateDocumentsDialog';

const motorista = {
  id: 'mot-1',
  nome: 'João Silva',
  nif: '123456789',
  documento_tipo: 'CC',
  documento_numero: '12345678',
  documento_validade: null,
  carta_conducao: null,
  carta_categorias: null,
  carta_validade: null,
  licenca_tvde_numero: null,
  licenca_tvde_validade: null,
  morada: 'Rua A',
  email: 'joao@teste.pt',
  telefone: '910000000',
  data_contratacao: '2026-01-15',
  cidade: 'Leiria',
};

function abrirDialogo() {
  return render(<GenerateDocumentsDialog open onOpenChange={() => {}} motorista={motorista} />);
}

describe('GenerateDocumentsDialog — PDF combinado', () => {
  beforeEach(() => {
    pdfsCriados.length = 0;
    vi.clearAllMocks();
  });

  it('mantém a primeira página do primeiro documento quando se gera mais do que um', async () => {
    abrirDialogo();

    // Os dois templates contrato_tvde da empresa por omissão vêm pré-seleccionados.
    await waitFor(() => {
      expect(screen.getByText('2 documento(s) selecionado(s)')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Download' }));

    await waitFor(() => {
      expect(pdfsCriados.length).toBe(1);
      expect((pdfsCriados[0] as FakePdf).save).toHaveBeenCalled();
    });

    const pdf = pdfsCriados[0] as FakePdf;

    // O sintoma reportado: a primeira página do primeiro documento
    // seleccionado desaparecia do PDF combinado.
    expect(pdf.paginas[0]).toContain('tpl-1');
    // E o segundo documento continua a ter a sua própria página, sem colar ao
    // primeiro nem herdar uma folha em branco.
    expect(pdf.paginas[1]).toContain('tpl-2');
    expect(pdf.paginas.length).toBe(2);
  });
});
