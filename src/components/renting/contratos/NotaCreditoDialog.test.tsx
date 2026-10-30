import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { insertMock, fromMock, carregarCliente, emitirMock, toastMock } = vi.hoisted(() => {
  const insertMock = vi.fn();
  const fromMock = vi.fn(() => ({ insert: insertMock }));
  const toastMock = { error: vi.fn(), warning: vi.fn(), success: vi.fn() };
  return { insertMock, fromMock, carregarCliente: vi.fn(), emitirMock: vi.fn(), toastMock };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fromMock } }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/hooks/useOrgDefinicoes', () => ({ useOrgDefinicoes: () => ({ data: null }) }));
vi.mock('@/lib/faturacao', () => ({
  carregarClienteParaFatura: carregarCliente,
  emitirDocumento: emitirMock,
  baixarDocumentoPdf: vi.fn(),
}));

import { NotaCreditoDialog, type NotaCreditoCobranca } from './NotaCreditoDialog';

const cobranca: NotaCreditoCobranca = {
  id: 'cob-1',
  descricao: 'Aluguer',
  valor_total: 123,
  taxa_iva: 23,
  destinatario_id: 'cli-1',
  destinatario_nome: 'Cliente Um',
  contrato_id: 'ct-1',
  documento_externo_ref: '4 67/94',
};

function renderDialog(c: NotaCreditoCobranca = cobranca) {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <NotaCreditoDialog
        open
        onOpenChange={() => {}}
        cobranca={c}
        orgId="org-1"
        defaultMotivo="Erro de faturação"
        onEmitida={() => {}}
      />
    </QueryClientProvider>
  );
}

describe('NotaCreditoDialog — leitura do cliente antes de gravar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('se a ficha do cliente não lê, não insere a nota de crédito nem emite', async () => {
    carregarCliente.mockRejectedValue(new Error('Ficha de cliente não encontrada'));
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /Emitir nota de crédito/ }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.error.mock.calls[0][0]).toContain('Ficha de cliente não encontrada');
    expect(insertMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
    expect(emitirMock).not.toHaveBeenCalled();
  });
});
