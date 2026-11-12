import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const {
  insertMock,
  fromMock,
  carregarCliente,
  emitirMock,
  consultarMock,
  toastMock,
  orgDef,
  baixarPdfMock,
} = vi.hoisted(() => {
  const insertMock = vi.fn();
  const fromMock = vi.fn(() => ({
    insert: insertMock,
    update: () => ({ eq: () => ({ is: () => Promise.resolve({ error: null }) }) }),
  }));
  const toastMock = { error: vi.fn(), warning: vi.fn(), success: vi.fn() };
  const orgDef = {
    data: { faturacao_provider: 'keyinvoice' as string | null },
    isLoading: false,
  };
  return {
    orgDef,
    insertMock,
    fromMock,
    carregarCliente: vi.fn(),
    emitirMock: vi.fn(),
    consultarMock: vi.fn(),
    toastMock,
    baixarPdfMock: vi.fn(),
  };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fromMock } }));
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('@/hooks/useOrgDefinicoes', () => ({
  useOrgDefinicoes: () => orgDef,
}));
vi.mock('@/lib/faturacao', () => ({
  carregarClienteParaFatura: carregarCliente,
  emitirDocumento: emitirMock,
  consultarDocumentoFiscal: consultarMock,
  baixarPdfEmSegundoPlano: baixarPdfMock,
}));

import { NotaCreditoDialog, type NotaCreditoCobranca } from './NotaCreditoDialog';

const MSG_SEM_CONFIRMACAO =
  'Não foi possível confirmar o total da fatura na KeyInvoice; não é possível emitir a nota de crédito.';

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

function renderDialog(c: NotaCreditoCobranca = cobranca, onOpenChange: () => void = () => {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (open: boolean) => (
    <QueryClientProvider client={qc}>
      <NotaCreditoDialog
        open={open}
        onOpenChange={onOpenChange}
        cobranca={c}
        orgId="org-1"
        defaultMotivo="Erro de faturação"
        onEmitida={() => {}}
      />
    </QueryClientProvider>
  );
  const r = render(ui(true));
  return Object.assign(qc, { rerender: (open: boolean) => r.rerender(ui(open)) });
}

function insertOk() {
  insertMock.mockReturnValue({
    select: () => ({
      single: () => Promise.resolve({ data: { id: 'nc-1', codigo: 7 }, error: null }),
    }),
  });
}

const botaoEmitir = () => screen.getByRole('button', { name: /Emitir nota de crédito/ });
const campoValor = () => screen.getByRole('spinbutton') as HTMLInputElement;

const saldoFiscal = (saldoCreditavel: number) => ({
  suportado: true as const,
  totalProvider: 590,
  totalWegest: 725.7,
  ncsEmitidas: Math.round((590 - saldoCreditavel) * 100) / 100,
  saldoCreditavel,
  voided: false,
});

describe('NotaCreditoDialog — leitura do cliente antes de gravar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    orgDef.data.faturacao_provider = 'keyinvoice';
    orgDef.isLoading = false;
    consultarMock.mockResolvedValue(saldoFiscal(123));
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
    orgDef.data.faturacao_provider = 'keyinvoice';
    orgDef.isLoading = false;
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

  it('fornecedor sem consulta: falha fechada, não usa o total do WeGest', async () => {
    consultarMock.mockResolvedValue({ suportado: false });
    renderDialog(cobrancaMaior);

    expect(await screen.findByText(MSG_SEM_CONFIRMACAO)).toBeInTheDocument();
    expect(botaoEmitir()).toBeDisabled();
    expect(campoValor()).toBeDisabled();
    fireEvent.click(botaoEmitir());
    expect(emitirMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('sem documento fiscal numa org com fornecedor: crédito interno como antes, sem consultar nem emitir', async () => {
    insertOk();
    renderDialog({ ...cobrancaMaior, documento_externo_ref: null });

    await waitFor(() => expect(campoValor().value).toBe('725.7'));
    expect(screen.queryByText(MSG_SEM_CONFIRMACAO)).not.toBeInTheDocument();
    expect(botaoEmitir()).not.toBeDisabled();
    fireEvent.click(botaoEmitir());

    await waitFor(() => expect(insertMock).toHaveBeenCalled());
    expect(consultarMock).not.toHaveBeenCalled();
    expect(emitirMock).not.toHaveBeenCalled();
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      valor: 725.7,
      documento_externo_ref: null,
    });
    await waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledWith(expect.stringContaining('registado'))
    );
  });

  it('enquanto as definições da org carregam, o botão fica desligado', () => {
    orgDef.isLoading = true;
    renderDialog({ ...cobrancaMaior, documento_externo_ref: null });

    expect(botaoEmitir()).toBeDisabled();
    expect(screen.getByText(/A confirmar o total da fatura/)).toBeInTheDocument();
  });

  it('org sem fornecedor de faturação mantém o teto da cobrança', async () => {
    orgDef.data.faturacao_provider = null;
    renderDialog({ ...cobrancaMaior, documento_externo_ref: null });

    await waitFor(() => expect(campoValor().value).toBe('725.7'));
    expect(botaoEmitir()).not.toBeDisabled();
  });

  const saldo = saldoFiscal;

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

  it('NC emitida mas não gravada no WeGest: erro persistente', async () => {
    carregarCliente.mockResolvedValue({ nome: 'Cliente Um' });
    consultarMock.mockResolvedValue(saldo(590));
    insertOk();
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

  it('emite primeiro e só depois grava, com o número fiscal devolvido', async () => {
    carregarCliente.mockResolvedValue({ nome: 'Cliente Um' });
    consultarMock.mockResolvedValue(saldo(590));
    insertOk();
    emitirMock.mockResolvedValue({ success: true, provider: { FullDocNumber: 'NC 7/1' } });
    renderDialog(cobrancaMaior);

    await waitFor(() => expect(campoValor().value).toBe('590'));
    fireEvent.click(botaoEmitir());

    await waitFor(() => expect(insertMock).toHaveBeenCalled());
    expect(emitirMock.mock.invocationCallOrder[0]).toBeLessThan(
      insertMock.mock.invocationCallOrder[0]
    );
    expect(insertMock.mock.calls[0][0]).toMatchObject({
      valor: 590,
      documento_externo_ref: 'NC 7/1',
    });
  });

  it('se a KeyInvoice recusa, não grava nada e mostra o motivo real', async () => {
    carregarCliente.mockResolvedValue({ nome: 'Cliente Um' });
    consultarMock.mockResolvedValue(saldo(590));
    emitirMock.mockRejectedValue(
      Object.assign(new Error('Série inválida'), { classe: 'known_failed' })
    );
    renderDialog(cobrancaMaior);

    await waitFor(() => expect(campoValor().value).toBe('590'));
    fireEvent.click(botaoEmitir());

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    expect(toastMock.error.mock.calls[0][0]).toContain('Série inválida');
    expect(toastMock.error.mock.calls[0][0]).toContain('nada foi gravado');
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('emitida mas o insert local falha: aviso que não desaparece, com o número fiscal', async () => {
    carregarCliente.mockResolvedValue({ nome: 'Cliente Um' });
    consultarMock.mockResolvedValue(saldo(590));
    insertMock.mockReturnValue({
      select: () => ({
        single: () =>
          Promise.resolve({ data: null, error: { message: 'NC acima do total da fatura' } }),
      }),
    });
    emitirMock.mockResolvedValue({ success: true, provider: { FullDocNumber: 'NC 7/1' } });
    renderDialog(cobrancaMaior);

    await waitFor(() => expect(campoValor().value).toBe('590'));
    fireEvent.click(botaoEmitir());

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        expect.stringContaining('NC 7/1'),
        expect.objectContaining({ duration: Infinity })
      )
    );
    expect(toastMock.error.mock.calls[0][0]).toContain('Avise o suporte');
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('mostra o aviso de total divergente devolvido pela edge', async () => {
    carregarCliente.mockResolvedValue({ nome: 'Cliente Um' });
    consultarMock.mockResolvedValue(saldo(590));
    insertOk();
    emitirMock.mockResolvedValue({
      success: true,
      provider: { FullDocNumber: 'NC 7/1' },
      totalDivergente: { numero: 'NC 7/1', esperado: 590, real: 725.7 },
    });
    renderDialog(cobrancaMaior);

    await waitFor(() => expect(campoValor().value).toBe('590'));
    fireEvent.click(botaoEmitir());

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        expect.stringContaining('A emissão de faturas desta integração foi travada.'),
        expect.objectContaining({ duration: Infinity, closeButton: true })
      )
    );
  });

  it('o PDF só descarrega depois de gravar a nota de crédito', async () => {
    carregarCliente.mockResolvedValue({ nome: 'Cliente Um' });
    consultarMock.mockResolvedValue(saldo(590));
    insertOk();
    const invoice = { id: 'inv-1', numero: 'NC 7/1' };
    emitirMock.mockResolvedValue({ success: true, provider: { FullDocNumber: 'NC 7/1' }, invoice });
    renderDialog(cobrancaMaior);

    await waitFor(() => expect(campoValor().value).toBe('590'));
    fireEvent.click(botaoEmitir());

    await waitFor(() => expect(baixarPdfMock).toHaveBeenCalledWith(invoice, expect.any(Function)));
    expect(insertMock.mock.invocationCallOrder[0]).toBeLessThan(
      baixarPdfMock.mock.invocationCallOrder[0]
    );
  });

  it('duplo clique no mesmo tick só emite uma vez', async () => {
    carregarCliente.mockResolvedValue({ nome: 'Cliente Um' });
    consultarMock.mockResolvedValue(saldo(590));
    insertOk();
    emitirMock.mockResolvedValue({ success: true, provider: { FullDocNumber: 'NC 7/1' } });
    renderDialog(cobrancaMaior);

    await waitFor(() => expect(campoValor().value).toBe('590'));
    const botao = botaoEmitir();
    act(() => {
      botao.click();
      botao.click();
    });

    await waitFor(() => expect(insertMock).toHaveBeenCalled());
    expect(emitirMock).toHaveBeenCalledTimes(1);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it('ignora o fecho do diálogo enquanto emite', async () => {
    const onOpenChange = vi.fn();
    carregarCliente.mockResolvedValue({ nome: 'Cliente Um' });
    consultarMock.mockResolvedValue(saldo(590));
    insertOk();
    let resolver: (v: unknown) => void = () => {};
    emitirMock.mockReturnValue(new Promise((r) => (resolver = r)));
    renderDialog(cobrancaMaior, onOpenChange);

    await waitFor(() => expect(campoValor().value).toBe('590'));
    fireEvent.click(botaoEmitir());
    await waitFor(() => expect(emitirMock).toHaveBeenCalled());
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();

    resolver({ success: true, provider: { FullDocNumber: 'NC 7/1' } });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('emitida sem número fiscal: aviso persistente para confirmar, sem "Crédito registado"', async () => {
    carregarCliente.mockResolvedValue({ nome: 'Cliente Um' });
    consultarMock.mockResolvedValue(saldo(590));
    insertOk();
    emitirMock.mockResolvedValue({ success: true });
    renderDialog(cobrancaMaior);

    await waitFor(() => expect(campoValor().value).toBe('590'));
    fireEvent.click(botaoEmitir());

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        expect.stringContaining('Confirme-a na KeyInvoice'),
        expect.objectContaining({ duration: Infinity, closeButton: true })
      )
    );
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it('emitida sem número e o insert falha: diz que há NC emitida', async () => {
    carregarCliente.mockResolvedValue({ nome: 'Cliente Um' });
    consultarMock.mockResolvedValue(saldo(590));
    insertMock.mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }),
    });
    emitirMock.mockResolvedValue({ success: true });
    renderDialog(cobrancaMaior);

    await waitFor(() => expect(campoValor().value).toBe('590'));
    fireEvent.click(botaoEmitir());

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    const [msg, opts] = toastMock.error.mock.calls[0];
    expect(msg).toContain('Foi emitida uma nota de crédito');
    expect(msg).not.toContain('Não foi possível gravar');
    expect(opts).toMatchObject({ duration: Infinity });
  });

  it('exceção depois de emitir (insert lança): aviso persistente em vez de "Erro ao emitir"', async () => {
    carregarCliente.mockResolvedValue({ nome: 'Cliente Um' });
    consultarMock.mockResolvedValue(saldo(590));
    insertMock.mockImplementation(() => {
      throw new Error('rede em baixo');
    });
    emitirMock.mockResolvedValue({ success: true, provider: { FullDocNumber: 'NC 7/1' } });
    renderDialog(cobrancaMaior);

    await waitFor(() => expect(campoValor().value).toBe('590'));
    fireEvent.click(botaoEmitir());

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith(
        expect.stringContaining('NC 7/1'),
        expect.objectContaining({ duration: Infinity, id: 'nc-NC 7/1' })
      )
    );
    expect(toastMock.error.mock.calls[0][0]).not.toContain('Erro ao emitir');
  });

  it('exceção antes de emitir mostra o motivo real de um erro que não é Error', async () => {
    carregarCliente.mockRejectedValue({ message: 'ficha ilegível' });
    consultarMock.mockResolvedValue(saldo(590));
    renderDialog(cobrancaMaior);

    await waitFor(() => expect(campoValor().value).toBe('590'));
    fireEvent.click(botaoEmitir());

    await waitFor(() =>
      expect(toastMock.error).toHaveBeenCalledWith('Erro ao emitir nota de crédito: ficha ilegível')
    );
  });

  it('falha unknown: o botão fica desligado até reabrir o diálogo', async () => {
    carregarCliente.mockResolvedValue({ nome: 'Cliente Um' });
    consultarMock.mockResolvedValue(saldo(590));
    emitirMock.mockRejectedValue(Object.assign(new Error('timeout'), { classe: 'unknown' }));
    const { rerender } = renderDialog(cobrancaMaior);

    await waitFor(() => expect(campoValor().value).toBe('590'));
    fireEvent.click(botaoEmitir());

    await waitFor(() => expect(botaoEmitir()).toBeDisabled());
    expect(screen.getByText(/Não se sabe se a nota de crédito foi emitida/)).toBeInTheDocument();
    expect(emitirMock).toHaveBeenCalledTimes(1);

    rerender(false);
    rerender(true);
    await waitFor(() => expect(botaoEmitir()).not.toBeDisabled());
  });
});
