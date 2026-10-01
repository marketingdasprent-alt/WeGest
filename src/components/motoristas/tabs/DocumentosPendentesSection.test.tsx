import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentosPendentesSection } from './DocumentosPendentesSection';
import {
  useAprovarDocumentoMotorista,
  useDocumentosPendentesMotorista,
  useRejeitarDocumentoMotorista,
  type DocumentoPendenteMotorista,
} from '@/hooks/useAprovacaoDocumentosMotorista';

vi.mock('@/hooks/useAprovacaoDocumentosMotorista', () => ({
  useDocumentosPendentesMotorista: vi.fn(),
  useAprovarDocumentoMotorista: vi.fn(),
  useRejeitarDocumentoMotorista: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { storage: { from: () => ({ createSignedUrl: vi.fn() }) } },
}));

const aprovarMutate = vi.fn();
const rejeitarMutate = vi.fn();

function pendente(over: Partial<DocumentoPendenteMotorista> = {}): DocumentoPendenteMotorista {
  return {
    id: 'doc-1',
    tipo_documento: 'carta_conducao',
    nome_ficheiro: 'carta.pdf',
    ficheiro_url: 'uid/cartas/1.pdf',
    data_validade: '2028-03-01',
    created_at: '2026-09-21T09:30:00Z',
    ...over,
  };
}

function montar(docs: DocumentoPendenteMotorista[], error: unknown = null) {
  vi.mocked(useDocumentosPendentesMotorista).mockReturnValue({
    data: docs,
    error,
  } as unknown as ReturnType<typeof useDocumentosPendentesMotorista>);
  vi.mocked(useAprovarDocumentoMotorista).mockReturnValue({
    mutate: aprovarMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useAprovarDocumentoMotorista>);
  vi.mocked(useRejeitarDocumentoMotorista).mockReturnValue({
    mutate: rejeitarMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useRejeitarDocumentoMotorista>);
  return render(<DocumentosPendentesSection motoristaId="m-1" />);
}

beforeEach(() => {
  aprovarMutate.mockReset();
  rejeitarMutate.mockReset();
});

describe('DocumentosPendentesSection', () => {
  it('sem pendentes não desenha nada — é uma caixa de entrada, não um cartão fixo', () => {
    const { container } = montar([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('lista os pendentes com o rótulo legível do tipo', () => {
    montar([
      pendente(),
      pendente({ id: 'doc-2', tipo_documento: 'licenca_tvde', nome_ficheiro: 'tvde.jpg' }),
    ]);
    expect(screen.getByText(/por aprovar \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText('Carta de Condução (Frente)')).toBeInTheDocument();
    expect(screen.getByText('Licença TVDE')).toBeInTheDocument();
    expect(screen.getByText(/tvde\.jpg/)).toBeInTheDocument();
  });

  it('aprovar chama a mutation com o id do documento', () => {
    montar([pendente()]);
    fireEvent.click(screen.getByRole('button', { name: /aprovar/i }));
    expect(aprovarMutate).toHaveBeenCalledWith('doc-1', expect.anything());
  });

  it('rejeitar exige motivo: o botão só liga depois de escrever', () => {
    montar([pendente()]);
    fireEvent.click(screen.getByRole('button', { name: /^rejeitar$/i }));

    const confirmar = screen
      .getAllByRole('button', { name: /^rejeitar$/i })
      .find((b) => b.closest('[role="dialog"]'))!;
    expect(confirmar).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Motivo da rejeição'), {
      target: { value: 'Fotografia ilegível' },
    });
    expect(confirmar).toBeEnabled();

    fireEvent.click(confirmar);
    expect(rejeitarMutate).toHaveBeenCalledWith(
      { documentoId: 'doc-1', motivo: 'Fotografia ilegível' },
      expect.anything()
    );
  });

  it('erro a carregar diz que é nosso, em vez de fingir que não há pendentes', () => {
    montar([], new Error('boom'));
    expect(screen.getByText(/não foi possível carregar/i)).toBeInTheDocument();
  });
});
