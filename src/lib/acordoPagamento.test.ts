import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted: as factories de vi.mock() abaixo são elevadas ao topo do
// ficheiro (antes de qualquer `const`), pelo que referenciar estes spies
// como `const` simples faria a factory correr antes de eles existirem
// (TDZ). vi.hoisted() garante que a criação corre junto com o hoist do
// próprio vi.mock — mesmo padrão de FecharContratoDialog.test.tsx.
const { rpc, updateOutbox, emitirDocumento, outboxSucessoErroForcado } = vi.hoisted(() => ({
  rpc: vi.fn(),
  updateOutbox: vi.fn(),
  emitirDocumento: vi.fn(),
  // Holder mutável só para o teste best-effort: permite forçar um erro
  // especificamente no update do outbox para 'sucesso', sem afectar os
  // outros updates de faturacao_outbox (pendente/suspenso no catch).
  outboxSucessoErroForcado: { valor: null as { message: string } | null },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => ({
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

/** RPC atómica: por omissão devolve liquidacao_pendente (caminho fiscal). */
function mockRpcPadrao() {
  rpc.mockImplementation((fn: string) => {
    if (fn === 'acordo_parcela_registar_pagamento') {
      return Promise.resolve({
        data: { recibo_id: 'r-1', estado: 'liquidacao_pendente' },
        error: null,
      });
    }
    return Promise.resolve({ error: null });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRpcPadrao();
  outboxSucessoErroForcado.valor = null;
});

describe('marcaCorrelacao', () => {
  it('produz a marca WG-IDK com o id da parcela', () => {
    expect(marcaCorrelacao('abc-123')).toBe('WG-IDK:abc-123');
  });
});

describe('registarPagamentoParcela', () => {
  it('chama a RPC atomica de registo com os campos certos', async () => {
    emitirDocumento.mockResolvedValue({ success: true, invoice: { id: 'inv-9' } });
    await registarPagamentoParcela(base);
    expect(rpc).toHaveBeenCalledWith(
      'acordo_parcela_registar_pagamento',
      expect.objectContaining({
        p_parcela_id: 'p-1',
        p_valor: 300,
        p_data: '2026-09-15',
        p_metodo: 'transferencia',
        p_entidade_id: 'e-1',
        p_contrato_id: null,
        p_cobranca_id: 'c-1',
        p_tem_documento_fiscal: true,
      })
    );
  });

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
    emitirDocumento.mockResolvedValue({ success: true, warning: 'falhou gravar localmente' });
    const r = await registarPagamentoParcela(base);
    expect(r.estado).toBe('paga');
    expect(rpc).toHaveBeenCalledWith('acordo_parcela_liquidar', {
      p_parcela_id: 'p-1',
      p_invoice_id: null,
    });
  });

  it('regista o pagamento (RPC atomica) ANTES de falar com o provider', async () => {
    emitirDocumento.mockRejectedValue(new Error('timeout'));
    await registarPagamentoParcela(base);
    expect(rpc).toHaveBeenCalledWith('acordo_parcela_registar_pagamento', expect.anything());
  });

  it('deixa em liquidacao_pendente e NAO liquida quando o RC falha', async () => {
    emitirDocumento.mockRejectedValue(new Error('timeout'));
    const r = await registarPagamentoParcela(base);
    expect(r.estado).toBe('liquidacao_pendente');
    expect(rpc).not.toHaveBeenCalledWith('acordo_parcela_liquidar', expect.anything());
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

  it('sem fatura fiscal original, liquida sem emitir RC (RPC devolve paga directamente)', async () => {
    rpc.mockImplementation((fn: string) => {
      if (fn === 'acordo_parcela_registar_pagamento') {
        return Promise.resolve({ data: { recibo_id: 'r-1', estado: 'paga' }, error: null });
      }
      return Promise.resolve({ error: null });
    });
    const r = await registarPagamentoParcela({ ...base, numeroFaturaOriginal: null });
    expect(emitirDocumento).not.toHaveBeenCalled();
    expect(r.estado).toBe('paga');
  });

  it('RPC de liquidacao a falhar no caminho feliz (apos RC emitido) rejeita e nunca devolve paga', async () => {
    emitirDocumento.mockResolvedValue({ success: true, invoice: { id: 'inv-9' } });
    rpc.mockImplementation((fn: string) => {
      if (fn === 'acordo_parcela_registar_pagamento') {
        return Promise.resolve({
          data: { recibo_id: 'r-1', estado: 'liquidacao_pendente' },
          error: null,
        });
      }
      if (fn === 'acordo_parcela_liquidar') {
        return Promise.resolve({ error: { message: 'parcela ja paga' } });
      }
      return Promise.resolve({ error: null });
    });
    await expect(registarPagamentoParcela(base)).rejects.toThrow();
  });

  it('RPC atomica a rejeitar (ex.: parcela ja tem pagamento registado) rejeita sem chegar a emitirDocumento', async () => {
    rpc.mockImplementation((fn: string) => {
      if (fn === 'acordo_parcela_registar_pagamento') {
        return Promise.resolve({
          data: null,
          error: { message: 'Esta parcela já tem um pagamento registado (recibo r-0).' },
        });
      }
      return Promise.resolve({ error: null });
    });
    await expect(registarPagamentoParcela(base)).rejects.toThrow();
    expect(emitirDocumento).not.toHaveBeenCalled();
  });

  it('outbox a falhar ao marcar sucesso e best-effort: nao impede o retorno paga', async () => {
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
