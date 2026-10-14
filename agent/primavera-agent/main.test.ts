import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLIENTES_POR_OMISSAO, MENSAGEM_NAO_EXECUTADO } from './asconnect.ts';
import { type ConfigAgente, processarJob, reportarResultado, resumoDoResultado } from './main.ts';

const cfg: ConfigAgente = {
  wegest_url: 'https://wegest.test/functions/v1',
  chave_agente: 'pva_x',
  primavera: { endpoint: 'http://srv:8090', username: 'u', password: 'p', enterprise: 'E' },
  iva_codes: { '23': '01' },
  tipos_documento: { FT: 'FA' },
  artigo_por_omissao: 'AL',
  clientes: CLIENTES_POR_OMISSAO,
  precos_com_iva: false,
  condicao_pagamento: '1',
};

/** Regista os relatórios enviados ao WeGest e responde com o estado indicado. */
function wegestFalso(status = 200, corpo = '{"success":true}') {
  const relatorios: Array<Record<string, unknown>> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      relatorios.push(JSON.parse(String(init?.body)));
      return new Response(corpo, { status });
    })
  );
  return relatorios;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('processarJob: prazo do WeGest', () => {
  it('com mais de 30 s não toca no Primavera e reporta falha "não executado"', async () => {
    const relatorios = wegestFalso();
    const primavera = vi.fn();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await processarJob(
      cfg,
      { id: 'j1', tipo: 'emit', payload: {}, criadoEm: Date.now() - 31_000 },
      primavera as unknown as typeof fetch
    );
    expect(primavera).not.toHaveBeenCalled();
    expect(relatorios).toEqual([{ job_id: 'j1', success: false, error: MENSAGEM_NAO_EXECUTADO }]);
  });

  it('dentro do prazo executa', async () => {
    const relatorios = wegestFalso();
    const primavera = vi.fn(async () => new Response('negado', { status: 401 }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await processarJob(
      cfg,
      { id: 'j2', tipo: 'health', payload: {}, criadoEm: Date.now() - 5_000 },
      primavera as unknown as typeof fetch
    );
    expect(primavera).toHaveBeenCalled();
    expect(relatorios[0]).toMatchObject({ job_id: 'j2', success: false });
    expect(relatorios[0].error).not.toBe(MENSAGEM_NAO_EXECUTADO);
  });
});

describe('aviso quando o WeGest não aceita o resultado', () => {
  it('o 409 regista em aviso o job e o número do documento', async () => {
    wegestFalso(409, '{"error":"job já fechado"}');
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await reportarResultado(cfg, 'j3', {
      success: true,
      resultado: { numero: 'FA 2026/68', docnum: '68' },
    });
    expect(avisos).toHaveBeenCalledTimes(1);
    expect(String(avisos.mock.calls[0][0])).toMatch(/j3.*HTTP 409.*documento FA 2026\/68/);
  });

  it('resumo: número do documento, senão o erro', () => {
    expect(resumoDoResultado({ success: true, resultado: { docnum: '68' } })).toBe('documento 68');
    expect(resumoDoResultado({ success: false, ambiguous: true, error: 'caiu' })).toBe('"caiu"');
  });
});
