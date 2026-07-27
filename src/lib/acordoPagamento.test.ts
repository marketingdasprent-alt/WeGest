import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted: as factories de vi.mock() abaixo são elevadas ao topo do
// ficheiro (antes de qualquer `const`), pelo que referenciar estes spies
// como `const` simples faria a factory correr antes de eles existirem
// (TDZ). vi.hoisted() garante que a criação corre junto com o hoist do
// próprio vi.mock — mesmo padrão de FecharContratoDialog.test.tsx.
const { insertRecibo, insertOutbox, updateOutbox, rpc, emitirDocumento, outboxSucessoErroForcado } =
  vi.hoisted(() => ({
    insertRecibo: vi.fn(),
    insertOutbox: vi.fn(),
    updateOutbox: vi.fn(),
    rpc: vi.fn(),
    emitirDocumento: vi.fn(),
    // Holder mutável só para o teste best-effort: permite forçar um erro
    // especificamente no update do outbox para 'sucesso', sem afectar os
    // outros updates de faturacao_outbox (pendente/suspenso no catch) nem o
    // update de acordo_parcelas — inspecciona-se a própria `linha` (estado)
    // em vez de espiar por posição de chamada.
    outboxSucessoErroForcado: { valor: null as { message: string } | null },
  }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => ({
      insert: (linha: unknown) => {
        if (tabela === 'recibos') return insertRecibo(linha);
        if (tabela === 'faturacao_outbox') return insertOutbox(linha);
        return { select: () => ({ single: async () => ({ data: null, error: null }) }) };
      },
      // Genérico para todas as tabelas; só faturacao_outbox é espiado, para
      // podermos distinguir 'pendente' (known_failed) de 'suspenso' (unknown)
      // nos testes abaixo — sem isto, os dois casos ficam indistinguíveis.
      update: (linha: unknown) => ({
        eq: async (...args: unknown[]) => {
          if (tabela === 'faturacao_outbox') {
            updateOutbox(linha, ...args);
            if (
              outboxSucessoErroForcado.valor &&
              (linha as { estado?: string })?.estado === 'sucesso'
            ) {
              return { error: outboxSucessoErroForcado.valor };
            }
          }
          return { error: null };
        },
      }),
    }),
    rpc,
  },
}));

vi.mock('./faturacao', () => ({
  emitirDocumento: (...a: unknown[]) => emitirDocumento(...a),
  clienteRowToFatura: (c: unknown) => c,
}));

import { registarPagamentoParcela, marcaCorrelacao } from './acordoPagamento';

const base = {
  parcelaId: 'p-1',
  orgId: 'o-1',
  acordoId: 'a-1',
  entidadeId: 'e-1',
  contratoId: null,
  cobrancaId: 'c-1',
  valor: 300,
  data: '2026-09-15',
  metodo: 'transferencia',
  numeroFaturaOriginal: 'FT 2026/143',
  titular: { nome: 'João Martins', nif: '234567890' },
  parcelaNumero: 2,
  totalParcelas: 3,
  acordoCodigo: 18,
};

beforeEach(() => {
  vi.clearAllMocks();
  insertRecibo.mockReturnValue({
    select: () => ({ single: async () => ({ data: { id: 'r-1' }, error: null }) }),
  });
  insertOutbox.mockResolvedValue({ error: null });
  rpc.mockResolvedValue({ error: null });
  outboxSucessoErroForcado.valor = null;
});

describe('marcaCorrelacao', () => {
  it('produz a marca WG-IDK com o id da parcela', () => {
    expect(marcaCorrelacao('abc-123')).toBe('WG-IDK:abc-123');
  });
});

describe('registarPagamentoParcela', () => {
  it('emite o RC em nome do TITULAR, nunca do responsavel', async () => {
    emitirDocumento.mockResolvedValue({ success: true, invoice: { id: 'inv-9' } });
    await registarPagamentoParcela(base);
    expect(emitirDocumento).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'RC',
        cliente: expect.objectContaining({ nif: '234567890' }),
        documento_referencia: 'FT 2026/143',
      })
    );
  });

  it('inclui a marca de correlacao nas observacoes', async () => {
    emitirDocumento.mockResolvedValue({ success: true, invoice: { id: 'inv-9' } });
    await registarPagamentoParcela(base);
    expect(emitirDocumento.mock.calls[0][0].observacoes).toContain('WG-IDK:p-1');
  });

  it('emite o RC com IVA a zero (o IVA foi liquidado na fatura original)', async () => {
    emitirDocumento.mockResolvedValue({ success: true, invoice: { id: 'inv-9' } });
    await registarPagamentoParcela(base);
    expect(emitirDocumento.mock.calls[0][0].itens[0]).toMatchObject({
      preco_unitario: 300,
      taxa_iva: 0,
    });
  });

  it('devolve paga e chama a RPC de liquidacao quando o RC sai', async () => {
    emitirDocumento.mockResolvedValue({ success: true, invoice: { id: 'inv-9' } });
    const r = await registarPagamentoParcela(base);
    expect(r.estado).toBe('paga');
    expect(rpc).toHaveBeenCalledWith('acordo_parcela_liquidar', {
      p_parcela_id: 'p-1',
      p_invoice_id: 'inv-9',
    });
  });

  it('sucesso sem invoice (mirror local falhou) liquida na mesma, com invoice_id null', async () => {
    // emitirDocumento() NÃO lança aqui — data.success é true. Só falta
    // `invoice` porque a gravação em `invoices` falhou depois de o provider
    // já ter confirmado. O documento é real; liquida-se sem o link local.
    emitirDocumento.mockResolvedValue({ success: true, warning: 'falhou gravar localmente' });
    const r = await registarPagamentoParcela(base);
    expect(r.estado).toBe('paga');
    expect(rpc).toHaveBeenCalledWith('acordo_parcela_liquidar', {
      p_parcela_id: 'p-1',
      p_invoice_id: null,
    });
  });

  it('grava o recibo ANTES de falar com o provider', async () => {
    emitirDocumento.mockRejectedValue(new Error('timeout'));
    await registarPagamentoParcela(base);
    expect(insertRecibo).toHaveBeenCalled();
  });

  it('deixa em liquidacao_pendente e NAO liquida quando o RC falha', async () => {
    emitirDocumento.mockRejectedValue(new Error('timeout'));
    const r = await registarPagamentoParcela(base);
    expect(r.estado).toBe('liquidacao_pendente');
    expect(rpc).not.toHaveBeenCalledWith('acordo_parcela_liquidar', expect.anything());
  });

  it('enfileira na outbox com a idempotency key da parcela', async () => {
    emitirDocumento.mockRejectedValue(new Error('timeout'));
    await registarPagamentoParcela(base);
    expect(insertOutbox).toHaveBeenCalledWith(
      expect.objectContaining({ idempotency_key: 'RC:parcela:p-1' })
    );
  });

  it('known_failed: outbox volta a pendente — seguro reagendar automaticamente', async () => {
    const erro = Object.assign(new Error('NIF inválido'), { classe: 'known_failed' });
    emitirDocumento.mockRejectedValue(erro);
    await registarPagamentoParcela(base);
    expect(updateOutbox).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'pendente' }),
      'idempotency_key',
      'RC:parcela:p-1'
    );
  });

  it('unknown: outbox suspende para reconciliacao manual, nunca reagenda sozinho', async () => {
    const erro = Object.assign(new Error('falha de transporte'), { classe: 'unknown' });
    emitirDocumento.mockRejectedValue(erro);
    await registarPagamentoParcela(base);
    expect(updateOutbox).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'suspenso', needs_reconcile: true }),
      'idempotency_key',
      'RC:parcela:p-1'
    );
  });

  it('erro sem classe (ex.: falha a contactar a propria funcao) suspende por omissao segura', async () => {
    emitirDocumento.mockRejectedValue(new Error('timeout'));
    await registarPagamentoParcela(base);
    expect(updateOutbox).toHaveBeenCalledWith(
      expect.objectContaining({ estado: 'suspenso', needs_reconcile: true }),
      'idempotency_key',
      'RC:parcela:p-1'
    );
  });

  it('sem fatura fiscal original, liquida sem emitir RC', async () => {
    const r = await registarPagamentoParcela({ ...base, numeroFaturaOriginal: null });
    expect(emitirDocumento).not.toHaveBeenCalled();
    expect(r.estado).toBe('paga');
  });

  it('RPC de liquidacao a falhar no caminho feliz (apos RC emitido) rejeita e nunca devolve paga', async () => {
    // emitirDocumento tem sucesso — o documento fiscal foi mesmo emitido no
    // provider. Só a RPC que promove a parcela a 'paga' na BD é que falha
    // (ex.: o seu proprio guard interno rejeita). Sem a verificacao de erro,
    // isto devolvia {estado: 'paga'} apesar de a BD nunca ter promovido a
    // parcela — o falso positivo que esta correcao elimina.
    emitirDocumento.mockResolvedValue({ success: true, invoice: { id: 'inv-9' } });
    rpc.mockResolvedValueOnce({ error: { message: 'parcela ja paga' } });
    await expect(registarPagamentoParcela(base)).rejects.toThrow();
  });

  it('insert na faturacao_outbox a falhar (ex.: idempotency key duplicada) rejeita sem chegar a emitirDocumento', async () => {
    emitirDocumento.mockResolvedValue({ success: true, invoice: { id: 'inv-9' } });
    insertOutbox.mockResolvedValueOnce({
      error: { message: 'duplicate key value violates unique constraint', code: '23505' },
    });
    await expect(registarPagamentoParcela(base)).rejects.toThrow();
    expect(emitirDocumento).not.toHaveBeenCalled();
  });

  it('outbox a falhar ao marcar sucesso e best-effort: nao impede o retorno paga', async () => {
    // A liquidacao (RPC) ja teve sucesso neste ponto — este update e só
    // bookkeeping da outbox. Um erro aqui fica so por um console.warn; o
    // reaper (Tarefa 5) varre outbox 'em_curso' esquecida ao fim de 10 min.
    emitirDocumento.mockResolvedValue({ success: true, invoice: { id: 'inv-9' } });
    outboxSucessoErroForcado.valor = { message: 'falha (simulada) a gravar outbox' };
    const r = await registarPagamentoParcela(base);
    expect(r.estado).toBe('paga');
    expect(rpc).toHaveBeenCalledWith('acordo_parcela_liquidar', {
      p_parcela_id: 'p-1',
      p_invoice_id: 'inv-9',
    });
  });
});
