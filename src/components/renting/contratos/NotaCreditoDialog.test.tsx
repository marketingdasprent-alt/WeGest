import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { insertMock, fromMock, carregarCliente, emitirMock, consultarMock, toastMock } = vi.hoisted(
  () => {
    const insertMock = vi.fn();
    const fromMock = vi.fn(() => ({
      insert: insertMock,
      update: () => ({ eq: () => ({ is: () => Promise.resolve({ error: null }) }) }),
    }));
    const toastMock = { error: vi.fn(), warning: vi.fn(), success: vi.fn() };
    return {
      insertMock,
      fromMock,
      carregarCliente: vi.fn(),
      emitirMock: vi.fn(),
      consultarMock: vi.fn(),
      toastMock,
    };
  }
);

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fromMock } }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/hooks/useOrgDefinicoes', () => ({
  useOrgDefinicoes: () => ({ data: { faturacao_provider: 'keyinvoice' } }),
}));
vi.mock('@/lib/faturacao', () => ({
  carregarClienteParaFatura: carregarCliente,
  emitirDocumento: emitirMock,
  consultarDocumentoFiscal: consultarMock,
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
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
  return qc;
}

const botaoEmitir = () => screen.getByRole('button', { name: /Emitir nota de crédito/ });
const campoValor = () => screen.getByRole('spinbutton') as HTMLInputElement;

describe('NotaCreditoDialog — leitura do cliente antes de gravar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consultarMock.mockResolvedValue({ suportado: false });
  });

  it('se a ficha do cliente não lê, não insere a nota de crédito nem emite', async () => {
    carregarCliente.mockRejectedValue(new Error('Ficha de cliente não encontrada'));
    renderDialog();

    await waitFor(() => expect(botaoEmitir()).not.toBeDisabled());
    fireEvent.click(botaoEmitir());

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.error.mock.calls[0][0]).toContain('Ficha de cliente não encontrada');
    expect(insertMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
    expect(emitirMock).not.toHaveBeenCalled();
  });
});

describe('NotaCreditoDialog — teto pelo total do documento no fornecedor', () => {
  // FT 4 67/15 da Sul: 590,00 na KeyInvoice, 725,70 na cobrança do WeGest.
  const cobrancaMaior: NotaCreditoCobranca = { ...cobranca, valor_total: 725.7 };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('propõe o total da KeyInvoice e recusa o da cobrança, sem gravar nada', async () => {
    consultarMock.mockResolvedValue({
      suportado: true,
      totalProvider: 590,
      totalWegest: 725.7,
      ncsEmitidas: 0,
      saldoCreditavel: 590,
      voided: false,
    });
    renderDialog(cobrancaMaior);

    await waitFor(() => expect(campoValor().value).toBe('590'));
    expect(screen.getByText('Total na KeyInvoice')).toBeInTheDocument();
    expect(screen.getByText('Já creditado na KeyInvoice')).toBeInTheDocument();
    expect(screen.getByText('Máximo a creditar')).toBeInTheDocument();
    expect(consultarMock).toHaveBeenCalledWith('4 67/94', 'cob-1');

    fireEvent.change(campoValor(), { target: { value: '725.70' } });

    expect(botaoEmitir()).toBeDisabled();
    expect(screen.getAllByText(/excede o saldo por creditar/).length).toBeGreaterThan(0);
    fireEvent.click(botaoEmitir());
    expect(insertMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
    expect(emitirMock).not.toHaveBeenCalled();
  });

  it('desconta o que já foi creditado na KeyInvoice', async () => {
    consultarMock.mockResolvedValue({
      suportado: true,
      totalProvider: 1115,
      totalWegest: 1371.45,
      ncsEmitidas: 868.58,
      saldoCreditavel: 246.42,
      voided: false,
    });
    renderDialog({ ...cobranca, valor_total: 1371.45 });

    await waitFor(() => expect(campoValor().value).toBe('246.42'));
  });

  it('se a consulta falha, bloqueia a emissão e não grava nada', async () => {
    consultarMock.mockRejectedValue(new Error('KeyInvoice indisponível'));
    renderDialog(cobrancaMaior);

    await waitFor(() =>
      expect(screen.getByText(/Não foi possível confirmar o total da fatura/)).toBeInTheDocument()
    );
    expect(botaoEmitir()).toBeDisabled();
    fireEvent.click(botaoEmitir());
    expect(insertMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
    expect(emitirMock).not.toHaveBeenCalled();
  });

  it('enquanto consulta, o botão fica desligado', async () => {
    consultarMock.mockReturnValue(new Promise(() => {}));
    renderDialog(cobrancaMaior);

    expect(botaoEmitir()).toBeDisabled();
    expect(screen.getByText(/A confirmar o total da fatura/)).toBeInTheDocument();
  });

  it('fornecedor sem consulta mantém o teto da cobrança', async () => {
    consultarMock.mockResolvedValue({ suportado: false });
    renderDialog(cobrancaMaior);

    await waitFor(() => expect(campoValor().value).toBe('725.7'));
    expect(screen.queryByText('Máximo a creditar')).not.toBeInTheDocument();
  });

  it('sem documento fiscal não consulta o fornecedor', async () => {
    renderDialog({ ...cobrancaMaior, documento_externo_ref: null });

    await waitFor(() => expect(campoValor().value).toBe('725.7'));
    expect(consultarMock).not.toHaveBeenCalled();
  });

  const saldo = (saldoCreditavel: number) => ({
    suportado: true as const,
    totalProvider: 590,
    totalWegest: 725.7,
    ncsEmitidas: round(590 - saldoCreditavel),
    saldoCreditavel,
    voided: false,
  });
  const round = (n: number) => Math.round(n * 100) / 100;

  it('reconsulta no clique: se o saldo baixou entretanto, não grava nada', async () => {
    carregarCliente.mockResolvedValue({ nome: 'Cliente Um' });
    consultarMock.mockResolvedValueOnce(saldo(590)).mockResolvedValueOnce(saldo(200));
    renderDialog(cobrancaMaior);

    await waitFor(() => expect(campoValor().value).toBe('590'));
    fireEvent.click(botaoEmitir());

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.error.mock.calls[0][0]).toContain('mudou para');
    expect(toastMock.error.mock.calls[0][0]).toContain('Nada foi gravado');
    expect(insertMock).not.toHaveBeenCalled();
    expect(emitirMock).not.toHaveBeenCalled();
  });

  it('se a reconsulta no clique falha, não grava nada', async () => {
    consultarMock.mockResolvedValueOnce(saldo(590)).mockRejectedValueOnce(new Error('timeout'));
    renderDialog(cobrancaMaior);

    await waitFor(() => expect(campoValor().value).toBe('590'));
    fireEvent.click(botaoEmitir());

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.error.mock.calls[0][0]).toContain('Nada foi gravado');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('fatura anulada na KeyInvoice: bloqueia e explica', async () => {
    consultarMock.mockResolvedValue({ ...saldo(0), voided: true });
    renderDialog(cobrancaMaior);

    await waitFor(() => expect(screen.getByText(/está anulada na KeyInvoice/)).toBeInTheDocument());
    expect(botaoEmitir()).toBeDisabled();
  });

  it('não volta a preencher por cima do que o utilizador escreveu', async () => {
    let resolver: (v: unknown) => void = () => {};
    consultarMock.mockReturnValueOnce(new Promise((r) => (resolver = r)));
    consultarMock.mockResolvedValue(saldo(590));
    const qc = renderDialog(cobrancaMaior);

    resolver(saldo(590));
    await waitFor(() => expect(campoValor().value).toBe('590'));
    fireEvent.change(campoValor(), { target: { value: '100' } });
    // Uma nova consulta (refetch) não repõe o valor proposto.
    void qc.invalidateQueries({ queryKey: ['documento-fiscal'] });
    await waitFor(() => expect(consultarMock.mock.calls.length).toBeGreaterThan(1));
    await new Promise((r) => setTimeout(r, 50));
    expect(campoValor().value).toBe('100');
  });

  it('fornecedor sem consulta mostra a nota de total não confirmado', async () => {
    consultarMock.mockResolvedValue({ suportado: false });
    renderDialog(cobrancaMaior);

    expect(
      await screen.findByText(/Total não confirmado no software de faturação/)
    ).toBeInTheDocument();
  });

  it('NC emitida mas não gravada no WeGest: erro persistente', async () => {
    carregarCliente.mockResolvedValue({ nome: 'Cliente Um' });
    consultarMock.mockResolvedValue(saldo(590));
    insertMock.mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({ data: { id: 'nc-1', codigo: 7 }, error: null }),
      }),
    });
    emitirMock.mockResolvedValue({
      success: true,
      localGravado: false,
      warning: 'Documento emitido mas falhou gravar localmente',
      provider: { FullDocNumber: 'NC 7/1' },
    });
    renderDialog(cobrancaMaior);

    await waitFor(() => expect(campoValor().value).toBe('590'));
    fireEvent.click(botaoEmitir());

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        expect.stringContaining('NÃO ficou registada no WeGest'),
        expect.objectContaining({ duration: expect.any(Number) })
      )
    );
  });
});
