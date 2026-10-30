import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { insertMock, fromMock, rpcMock, carregarCliente, emitirMutate, toastMock } = vi.hoisted(
  () => {
    const insertMock = vi.fn();
    const fromMock = vi.fn(() => ({ insert: insertMock }));
    const toastMock = { error: vi.fn(), warning: vi.fn(), success: vi.fn() };
    return {
      insertMock,
      fromMock,
      rpcMock: vi.fn(),
      carregarCliente: vi.fn(),
      emitirMutate: vi.fn(),
      toastMock,
    };
  }
);

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: fromMock, rpc: rpcMock },
}));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/hooks/useOrgDefinicoes', () => ({ useOrgDefinicoes: () => ({ data: null }) }));
vi.mock('@/hooks/useFaturacao', () => ({
  useEmitirEEscreverFatura: () => ({ mutateAsync: emitirMutate }),
}));
vi.mock('@/hooks/useOpcoesFaturacao', () => ({
  useEscolhaFornecedor: () => ({ bloqueiaConfirmar: false, integracaoId: null }),
}));
vi.mock('@/components/faturacao/SeletorFornecedorFaturacao', () => ({
  SeletorFornecedorFaturacao: () => null,
}));
vi.mock('@/lib/faturacao', () => ({
  carregarClienteParaFatura: carregarCliente,
  baixarPdfEmSegundoPlano: vi.fn(),
}));

import { NovaFaturaDialog } from './NovaFaturaDialog';

describe('NovaFaturaDialog — leitura do cliente antes de gravar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('se a ficha do cliente não lê, não insere a cobrança nem emite', async () => {
    carregarCliente.mockRejectedValue(new Error('Ficha de cliente não encontrada'));
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NovaFaturaDialog
          open
          onOpenChange={() => {}}
          alvo={{ tipo: 'contrato', id: 'ct-1', orgId: 'org-1', codigoLabel: 'Contrato #1' }}
          destinatario={{ id: 'cli-1', nome: 'Cliente Um' }}
          onCriada={() => {}}
        />
      </QueryClientProvider>
    );

    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /^Criar$/ }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.error.mock.calls[0][0]).toContain('Ficha de cliente não encontrada');
    expect(carregarCliente).toHaveBeenCalledWith('cli-1', 'Cliente Um');
    expect(fromMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(emitirMutate).not.toHaveBeenCalled();
  });
});
