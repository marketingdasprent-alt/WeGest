import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLIENTES_POR_OMISSAO, MENSAGEM_NAO_EXECUTADO } from './asconnect.ts';
import {
  avisoDesistiDeReportar,
  type ConfigAgente,
  type JobRecebido,
  ordenarJobs,
  processarJob,
  reportarResultado,
  resumoDoResultado,
} from './main.ts';

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

describe('processarJob: pdf', () => {
  const payloadPdf = { tipo_documento: 'FA', serie: '2026', numero: '50' };

  /** Primavera falso: token e a resposta do imprimir indicada; regista os caminhos pedidos. */
  function primaveraFalso(imprimir: () => Response) {
    const caminhos: string[] = [];
    const fn = vi.fn(async (url: string) => {
      caminhos.push(url.replace('http://srv:8090', ''));
      return url.endsWith('/auth/gettoken') ? new Response('tok') : imprimir();
    });
    return { fn: fn as unknown as typeof fetch, caminhos };
  }

  it('dentro do prazo pede o PDF e reporta base64 e extensão', async () => {
    const relatorios = wegestFalso();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { fn, caminhos } = primaveraFalso(
      () =>
        new Response(
          JSON.stringify({
            DocGerado: 'JVBERi0xLjQK',
            ExtensaoDocGerado: 'PDF',
            Estado: { Mensagem: 'Sucesso' },
          })
        )
    );
    await processarJob(
      cfg,
      { id: 'p1', tipo: 'pdf', payload: payloadPdf, criadoEm: Date.now() - 5_000 },
      fn
    );
    expect(caminhos).toEqual(['/auth/gettoken', '/documentos/vendas/imprimir']);
    expect(relatorios).toEqual([
      { job_id: 'p1', success: true, resultado: { base64: 'JVBERi0xLjQK', extensao: 'PDF' } },
    ]);
  });

  it('com mais de 30 s não pede o PDF e reporta falha simples, nunca ambígua', async () => {
    const relatorios = wegestFalso();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { fn, caminhos } = primaveraFalso(() => new Response('{}'));
    await processarJob(
      cfg,
      { id: 'p2', tipo: 'pdf', payload: payloadPdf, criadoEm: Date.now() - 31_000 },
      fn
    );
    expect(caminhos).toEqual([]);
    expect(relatorios).toEqual([{ job_id: 'p2', success: false, error: MENSAGEM_NAO_EXECUTADO }]);
  });

  it('um 5xx do Primavera é falha simples: imprimir não cria documento', async () => {
    const relatorios = wegestFalso();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { fn } = primaveraFalso(() => new Response('rebentou', { status: 500 }));
    await processarJob(
      cfg,
      { id: 'p3', tipo: 'pdf', payload: payloadPdf, criadoEm: Date.now() - 1_000 },
      fn
    );
    expect(relatorios).toHaveLength(1);
    expect(relatorios[0]).toMatchObject({ job_id: 'p3', success: false });
    expect(relatorios[0]).not.toHaveProperty('ambiguous');
    expect(String(relatorios[0].error)).toContain('HTTP 500');
  });

  it('sem número no pedido não chega ao Primavera', async () => {
    const relatorios = wegestFalso();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const { fn, caminhos } = primaveraFalso(() => new Response('{}'));
    await processarJob(
      cfg,
      { id: 'p4', tipo: 'pdf', payload: { tipo_documento: 'FA' }, criadoEm: Date.now() },
      fn
    );
    expect(caminhos).toEqual([]);
    expect(relatorios[0]).toMatchObject({ job_id: 'p4', success: false });
  });

  it('o resumo de um PDF não despeja o base64 no aviso', () => {
    expect(
      resumoDoResultado({ success: true, resultado: { base64: 'x'.repeat(5000), extensao: 'PDF' } })
    ).toBe('PDF (5000 caracteres em base64)');
  });
});
describe('ordem dentro de um lote', () => {
  const job = (id: string, tipo: JobRecebido['tipo']): JobRecebido => ({ id, tipo, payload: {} });

  it('os emit passam à frente dos pdf e dos health, mantendo a ordem entre iguais', () => {
    const lote = [job('p1', 'pdf'), job('e1', 'emit'), job('h1', 'health'), job('e2', 'emit')];
    expect(ordenarJobs(lote).map((j) => j.id)).toEqual(['e1', 'e2', 'p1', 'h1']);
    expect(lote.map((j) => j.id)).toEqual(['p1', 'e1', 'h1', 'e2']);
  });
});

describe('aviso quando o resultado não chega ao WeGest', () => {
  it('num emit manda confirmar no Primavera; num pdf ou health não fala em ambíguo', () => {
    const r = { success: true, resultado: { docnum: '68' } };
    expect(avisoDesistiDeReportar('j1', r, 'emit')).toContain('ambíguo');
    expect(avisoDesistiDeReportar('j1', r)).toContain('ambíguo');
    for (const tipo of ['pdf', 'health'] as const) {
      const aviso = avisoDesistiDeReportar(
        'j1',
        { success: true, resultado: { base64: 'x' } },
        tipo
      );
      expect(aviso).not.toContain('ambíguo');
      expect(aviso).toContain('nada a confirmar no Primavera');
    }
  });
});
