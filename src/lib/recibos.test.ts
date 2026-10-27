import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock, emitirMock, chamadas, respostas } = vi.hoisted(() => {
  const chamadas: { tabela: string; metodo: string; args: unknown[] }[] = [];
  const respostas: Record<string, { data: unknown; error: unknown }> = {};
  // Cadeia mínima do supabase-js: cada método regista-se e devolve a cadeia;
  // single/maybeSingle/await devolvem a resposta configurada para a tabela.
  const fromMock = vi.fn((tabela: string) => {
    const resposta = () => Promise.resolve(respostas[tabela] ?? { data: null, error: null });
    const cadeia: Record<string, unknown> = {};
    for (const metodo of ['select', 'insert', 'update', 'eq']) {
      cadeia[metodo] = (...args: unknown[]) => {
        chamadas.push({ tabela, metodo, args });
        return cadeia;
      };
    }
    cadeia.single = resposta;
    cadeia.maybeSingle = resposta;
    cadeia.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
      resposta().then(ok, ko);
    return cadeia;
  });
  return { fromMock, emitirMock: vi.fn(), chamadas, respostas };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: fromMock } }));
vi.mock('@/lib/faturacao', () => ({
  emitirDocumento: emitirMock,
  clienteRowToFatura: (_row: unknown, nome: string) => ({ nome }),
}));

import { registarRecibo, registarRecibosEmLote, type CobrancaParaRecibo } from './recibos';
import { ErroRecibo } from './reciboErro';

const cobranca = (extra: Partial<CobrancaParaRecibo> = {}): CobrancaParaRecibo => ({
  id: 'cob-1',
  descricao: 'Aluguer',
  saldoPagar: 100,
  destinatario_id: 'cli-1',
  destinatario_nome: 'Cliente Um',
  contrato_id: 'ct-1',
  documento_externo_ref: '4 67/94',
  ...extra,
});
const pagamento = { valor: 100, metodo: 'transferencia', data: '2026-10-27' };

const inserido = () => chamadas.find((c) => c.tabela === 'recibos' && c.metodo === 'insert');
const marcouPaga = () => chamadas.some((c) => c.tabela === 'contrato_cobrancas');

describe('registarRecibo', () => {
  beforeEach(() => {
    chamadas.length = 0;
    for (const k of Object.keys(respostas)) delete respostas[k];
    respostas.recibos = { data: { id: 'rec-1' }, error: null };
    emitirMock.mockReset();
    emitirMock.mockResolvedValue({
      success: true,
      provider: { FullDocNumber: '9 70/1' },
      invoice: { id: 'inv-1' },
    });
  });

  it('emite no KeyInvoice e só depois grava, já com o nº do recibo fiscal', async () => {
    const r = await registarRecibo('org-1', cobranca(), pagamento);

    expect(emitirMock).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'RC', cobranca_id: 'cob-1', documento_referencia: '4 67/94' })
    );
    expect(inserido()?.args[0]).toMatchObject({
      referencia: 'cob-1',
      valor: 100,
      documento_externo_ref: '9 70/1',
    });
    expect(marcouPaga()).toBe(true);
    expect(r.numeroFiscal).toBe('9 70/1');
  });

  it('se o KeyInvoice recusa, não grava nada e explica o motivo', async () => {
    emitirMock.mockRejectedValue(
      new Error('insertReceipt falhou: Valor a liquidar superior ao valor pendente')
    );

    const erro = await registarRecibo('org-1', cobranca(), pagamento).catch((e) => e);

    expect(erro).toBeInstanceOf(ErroRecibo);
    expect(erro.explicacao.titulo).toContain('menos por pagar');
    expect(inserido()).toBeUndefined();
    expect(marcouPaga()).toBe(false);
  });

  it('se o WeGest falha depois do KeyInvoice aceitar, proíbe tentar de novo', async () => {
    respostas.recibos = { data: null, error: { message: 'permission denied' } };

    const erro = await registarRecibo('org-1', cobranca(), pagamento).catch((e) => e);

    expect(erro.explicacao.podeTentarDeNovo).toBe(false);
    expect(erro.explicacao.titulo).toContain('9 70/1');
    expect(erro.explicacao.detalhe).toBe('permission denied');
  });

  it('fatura sem documento fiscal: recibo só no WeGest', async () => {
    const r = await registarRecibo('org-1', cobranca({ documento_externo_ref: null }), pagamento);

    expect(emitirMock).not.toHaveBeenCalled();
    expect(inserido()?.args[0]).toMatchObject({ documento_externo_ref: null });
    expect(r.numeroFiscal).toBeNull();
  });

  it('pagamento parcial não marca a fatura como paga', async () => {
    await registarRecibo('org-1', cobranca(), { ...pagamento, valor: 40 });
    expect(marcouPaga()).toBe(false);
  });
});

describe('registarRecibosEmLote', () => {
  it('um recibo por fatura, pelo saldo todo, e uma falha não pára as seguintes', async () => {
    const registar = vi
      .fn()
      .mockResolvedValueOnce({ reciboId: 'r1', numeroFiscal: '9 70/1', invoice: null, aviso: null })
      .mockRejectedValueOnce(new Error('rede em baixo'))
      .mockResolvedValueOnce({
        reciboId: 'r3',
        numeroFiscal: '9 70/2',
        invoice: null,
        aviso: null,
      });
    const progresso = vi.fn();
    const lista = [
      cobranca({ id: 'a', saldoPagar: 10 }),
      cobranca({ id: 'b', saldoPagar: 20 }),
      cobranca({ id: 'c', saldoPagar: 30.5 }),
    ];

    const res = await registarRecibosEmLote(
      'org-1',
      lista,
      { metodo: 'mbway', data: '2026-10-27' },
      progresso,
      registar
    );

    expect(registar).toHaveBeenCalledTimes(3);
    expect(registar.mock.calls[2][2]).toEqual({ metodo: 'mbway', data: '2026-10-27', valor: 30.5 });
    expect(res.map((r) => r.ok)).toEqual([true, false, true]);
    expect(progresso).toHaveBeenLastCalledWith(3, 3);
  });

  it('erro já explicado chega ao ecrã tal e qual', async () => {
    const explicacao = { titulo: 't', oQueFazer: 'o', detalhe: 'd', podeTentarDeNovo: false };
    const registar = vi.fn().mockRejectedValue(new ErroRecibo(explicacao));

    const [r] = await registarRecibosEmLote(
      'org-1',
      [cobranca()],
      { metodo: 'x', data: 'y' },
      undefined,
      registar
    );

    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.erro).toBe(explicacao);
  });
});
