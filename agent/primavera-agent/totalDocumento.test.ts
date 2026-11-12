import { describe, expect, it, vi } from 'vitest';
import { criarClienteAsConnect, PRAZO_INSERIR_MS } from './asconnect.ts';
import {
  MARGEM_LEITURA_TOTAL_MS,
  MINIMO_LEITURA_TOTAL_MS,
  timeoutDaLeituraTotal,
  TIMEOUT_LEITURA_TOTAL_MS,
} from './totalDocumento.ts';
import { cfgBase, DOC_OK, fetchFalso, payload, SUCESSO } from './testeUtil.ts';

describe('emitir: total lido do Primavera', () => {
  const LINHA_TOTAL = {
    Resultado: [{ TipoDoc: 'FA', Serie: '2026', NumDoc: 68, TotalDocumento: 123 }],
    ...SUCESSO,
  };
  const base = () => ({
    '/auth/gettoken': ['tok'],
    '/erp/query/tabledata': [{ Resultado: [{ Cliente: 'C1' }], ...SUCESSO }],
    '/documentos/vendas/inserir': [DOC_OK],
  });
  const emitirCom = (fn: typeof fetch, prazo = {}) =>
    criarClienteAsConnect(cfgBase, fn).emitir(payload, new Date(), prazo);

  it('lê o total do CabecDoc logo a seguir ao inserir', async () => {
    const { fn, chamadas } = fetchFalso({
      ...base(),
      '/erp/query/tabledata': [{ Resultado: [{ Cliente: 'C1' }], ...SUCESSO }, LINHA_TOTAL],
    });
    const r = await emitirCom(fn);
    expect(r.total).toBe(123);
    expect(r.numero).toBe('FA 2026/68');
    expect(chamadas.at(-1)!.corpo.Query).toMatchObject({
      Table: 'CabecDoc',
      Filters: [
        { field: 'TipoDoc', operator: 'Equal', value: 'FA' },
        { field: 'Serie', operator: 'Equal', value: '2026' },
        { field: 'NumDoc', operator: 'Equal', value: 68 },
      ],
    });
  });

  it('aceita o campo com outra capitalização e total em texto numérico', async () => {
    const { fn } = fetchFalso({
      ...base(),
      '/erp/query/tabledata': [
        { Resultado: [{ Cliente: 'C1' }], ...SUCESSO },
        { Resultado: [{ totaldocumento: '123.45' }], ...SUCESSO },
      ],
    });
    expect((await emitirCom(fn)).total).toBe(123.45);
  });

  it.each([
    ['sem linhas', { Resultado: [], ...SUCESSO }],
    ['sem campo', { Resultado: [{ TotalMerc: 1 }], ...SUCESSO }],
    ['valor não numérico', { Resultado: [{ TotalDocumento: 'abc' }], ...SUCESSO }],
    ['valor nulo', { Resultado: [{ TotalDocumento: null }], ...SUCESSO }],
    ['valor vazio', { Resultado: [{ TotalDocumento: '' }], ...SUCESSO }],
    ['estado de recusa', { Estado: { Mensagem: 'Erro' } }],
    ['lixo', 'isto não é json'],
  ])('leitura com %s devolve total null sem falhar o emit', async (_nome, resposta) => {
    const { fn } = fetchFalso({
      ...base(),
      '/erp/query/tabledata': [{ Resultado: [{ Cliente: 'C1' }], ...SUCESSO }, resposta],
    });
    const r = await emitirCom(fn);
    expect(r.total).toBeNull();
    expect(r.docnum).toBe('68');
  });

  it('leitura que lança (rede/timeout) devolve total null sem falhar o emit', async () => {
    const { fn: interno } = fetchFalso(base());
    const fn = (async (url: string, init?: RequestInit) => {
      if (url.endsWith('/documentos/vendas/inserir')) return interno(url, init);
      if (url.endsWith('/erp/query/tabledata') && (fn as any).jaConsultou) {
        throw new Error('timeout');
      }
      (fn as any).jaConsultou = url.endsWith('/erp/query/tabledata');
      return interno(url, init);
    }) as typeof fetch;
    const r = await emitirCom(fn);
    expect(r.total).toBeNull();
    expect(r.numero).toBe('FA 2026/68');
  });

  it('sem orçamento de tempo salta a leitura e não faz o pedido', async () => {
    const { fn, chamadas } = fetchFalso(base());
    const horas = [20_000, 36_000];
    const r = await emitirCom(fn, { criadoEm: 0, relogio: () => horas.shift() ?? 36_000 });
    expect(r.total).toBeNull();
    expect(chamadas.filter((c) => c.corpo?.Query?.Table === 'CabecDoc')).toHaveLength(0);
  });

  it('o orçamento da leitura acaba 3 s antes do prazo do inserir e só corre com 5 s livres', () => {
    expect(TIMEOUT_LEITURA_TOTAL_MS).toBe(5_000);
    expect(MINIMO_LEITURA_TOTAL_MS).toBe(5_000);
    expect(MARGEM_LEITURA_TOTAL_MS).toBe(3_000);
    expect(timeoutDaLeituraTotal(0, 20_000, PRAZO_INSERIR_MS)).toBe(5_000);
    expect(timeoutDaLeituraTotal(0, 35_000, PRAZO_INSERIR_MS)).toBe(5_000);
    expect(timeoutDaLeituraTotal(0, 35_001, PRAZO_INSERIR_MS)).toBeNull();
    expect(timeoutDaLeituraTotal(0, 41_000, PRAZO_INSERIR_MS)).toBeNull();
    expect(timeoutDaLeituraTotal(undefined, 999_999, PRAZO_INSERIR_MS)).toBe(5_000);
  });

  it('a leitura nunca acaba depois de PRAZO_INSERIR_MS - 3 s', async () => {
    const { fn } = fetchFalso({
      ...base(),
      '/erp/query/tabledata': [{ Resultado: [{ Cliente: 'C1' }], ...SUCESSO }, LINHA_TOTAL],
    });
    const limites: number[] = [];
    const espia = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      limites.push(ms);
      return new AbortController().signal;
    });
    try {
      await emitirCom(fn, { criadoEm: 0, relogio: () => 35_000 });
    } finally {
      espia.mockRestore();
    }
    expect(35_000 + limites.at(-1)!).toBeLessThanOrEqual(
      PRAZO_INSERIR_MS - MARGEM_LEITURA_TOTAL_MS
    );
  });

  it('não pede a coluna Entidade, que ninguém usa', async () => {
    const { fn, chamadas } = fetchFalso({
      ...base(),
      '/erp/query/tabledata': [{ Resultado: [{ Cliente: 'C1' }], ...SUCESSO }, LINHA_TOTAL],
    });
    await emitirCom(fn);
    expect(chamadas.at(-1)!.corpo.Query.Columns).not.toContain('Entidade');
  });

  it.each([
    ['123,45', 123.45],
    ['1.234,56', 1234.56],
    ['123.45', 123.45],
  ])('total em texto %s lê-se como %d', async (texto, esperado) => {
    const { fn } = fetchFalso({
      ...base(),
      '/erp/query/tabledata': [
        { Resultado: [{ Cliente: 'C1' }], ...SUCESSO },
        { Resultado: [{ TotalDocumento: texto }], ...SUCESSO },
      ],
    });
    expect((await emitirCom(fn)).total).toBe(esperado);
  });

  it('regista o motivo (sem dados) quando a leitura falha ou vem sem total', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const falha = fetchFalso({
        ...base(),
        '/erp/query/tabledata': [
          { Resultado: [{ Cliente: 'C1' }], ...SUCESSO },
          { Estado: { Mensagem: 'Erro segredo-do-cliente' } },
        ],
      });
      expect((await emitirCom(falha.fn)).total).toBeNull();
      const semCampo = fetchFalso({
        ...base(),
        '/erp/query/tabledata': [
          { Resultado: [{ Cliente: 'C1' }], ...SUCESSO },
          { Resultado: [], ...SUCESSO },
        ],
      });
      expect((await emitirCom(semCampo.fn)).total).toBeNull();
      expect(aviso).toHaveBeenCalledTimes(2);
      expect(String(aviso.mock.calls[1][0])).toContain('sem linha');
      expect(JSON.stringify(aviso.mock.calls)).not.toContain('Cliente');
    } finally {
      aviso.mockRestore();
    }
  });
});
