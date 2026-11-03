import { describe, it, expect, vi, beforeEach } from 'vitest';

const { fromMock, invokeMock, resposta } = vi.hoisted(() => {
  const resposta: { data: unknown; error: unknown } = { data: null, error: null };
  const fromMock = vi.fn(() => {
    const cadeia: Record<string, unknown> = {};
    for (const metodo of ['select', 'eq']) cadeia[metodo] = () => cadeia;
    cadeia.maybeSingle = () => Promise.resolve(resposta);
    cadeia.single = () => Promise.resolve(resposta);
    return cadeia;
  });
  return { fromMock, invokeMock: vi.fn(), resposta };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: fromMock, functions: { invoke: invokeMock } },
}));

import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import { carregarClienteParaFatura, emitirDocumento } from './faturacao';
import { mensagemFalhaEmissao } from './faturacaoFalha';

describe('carregarClienteParaFatura', () => {
  beforeEach(() => {
    resposta.data = null;
    resposta.error = null;
  });

  it('erro do Supabase falha alto em vez de seguir sem NIF', async () => {
    resposta.error = { message: 'permission denied for table clientes' };
    await expect(carregarClienteParaFatura('cli-1', 'Fulano')).rejects.toThrow(
      /Não foi possível ler a ficha do cliente.*permission denied/
    );
  });

  it('ficha inexistente falha alto', async () => {
    resposta.data = null;
    await expect(carregarClienteParaFatura('cli-1', 'Fulano')).rejects.toThrow(
      /Ficha de cliente não encontrada/
    );
  });

  it('ficha válida é mapeada para o cabeçalho fiscal', async () => {
    resposta.data = {
      nome: 'Maria Silva',
      nif: '123456789',
      email: 'm@x.pt',
      morada: 'Rua A',
      codigo_postal: '1000-001',
      localidade: 'Lisboa',
    };
    await expect(carregarClienteParaFatura('cli-1', 'Fulano')).resolves.toEqual({
      nome: 'Maria Silva',
      nif: '123456789',
      email: 'm@x.pt',
      morada: 'Rua A',
      codigo_postal: '1000-001',
      localidade: 'Lisboa',
      country_code: 'PT',
    });
  });

  it('ficha sem NIF (consumidor final real) não é erro e usa o nome de reserva', async () => {
    resposta.data = { nome: null, nif: null };
    const cli = await carregarClienteParaFatura('cli-1', 'Fulano');
    expect(cli.nome).toBe('Fulano');
    expect(cli.nif).toBeUndefined();
  });
});

describe('emitirDocumento — classe do erro', () => {
  const payload = { tipo: 'FT', cliente: { nome: 'X' }, itens: [] } as never;
  const classeDe = (e: unknown) => (e as { classe?: string }).classe;

  beforeEach(() => invokeMock.mockReset());

  it('falha de transporte fica unknown: o pedido pode ter chegado ao servidor', async () => {
    invokeMock.mockResolvedValue({ data: null, error: new Error('Failed to fetch') });
    const erro = await emitirDocumento(payload).catch((e: unknown) => e);
    expect(classeDe(erro)).toBe('unknown');
    expect(mensagemFalhaEmissao(erro)).toContain('PODE ter sido');
  });

  it('transporte sem mensagem continua unknown', async () => {
    invokeMock.mockResolvedValue({ data: null, error: {} });
    const erro = await emitirDocumento(payload).catch((e: unknown) => e);
    expect(classeDe(erro)).toBe('unknown');
    expect((erro as Error).message).toBe('Falha a contactar o serviço de faturação');
  });

  it('FunctionsFetchError e FunctionsRelayError ficam unknown', async () => {
    for (const falha of [new FunctionsFetchError({}), new FunctionsRelayError({})]) {
      invokeMock.mockResolvedValue({ data: null, error: falha });
      const erro = await emitirDocumento(payload).catch((e: unknown) => e);
      expect(classeDe(erro)).toBe('unknown');
    }
  });

  it.each([
    [401, 'known_failed'],
    [403, 'known_failed'],
    [404, 'known_failed'],
    [405, 'known_failed'],
    [500, 'unknown'],
    [504, 'unknown'],
  ])('FunctionsHttpError %i sem corpo útil fica %s', async (status, esperada) => {
    const resp = new Response('not json', { status });
    invokeMock.mockResolvedValue({ data: null, error: new FunctionsHttpError(resp) });
    const erro = await emitirDocumento(payload).catch((e: unknown) => e);
    expect(classeDe(erro)).toBe(esperada);
  });

  it('FunctionsHttpError com classe no corpo mantém essa classe', async () => {
    const resp = new Response(JSON.stringify({ success: false, classe: 'unknown' }), {
      status: 401,
    });
    invokeMock.mockResolvedValue({ data: null, error: new FunctionsHttpError(resp) });
    const erro = await emitirDocumento(payload).catch((e: unknown) => e);
    expect(classeDe(erro)).toBe('unknown');
  });

  it('resposta estruturada known_failed mantém a classe', async () => {
    invokeMock.mockResolvedValue({
      data: { success: false, error: 'Série inválida', classe: 'known_failed' },
      error: null,
    });
    const erro = await emitirDocumento(payload).catch((e: unknown) => e);
    expect(classeDe(erro)).toBe('known_failed');
    expect((erro as Error).message).toBe('Série inválida');
  });

  it('resposta estruturada unknown mantém a classe', async () => {
    invokeMock.mockResolvedValue({
      data: { success: false, error: 'sem resposta', classe: 'unknown' },
      error: null,
    });
    const erro = await emitirDocumento(payload).catch((e: unknown) => e);
    expect(classeDe(erro)).toBe('unknown');
  });

  it('sucesso devolve o resultado', async () => {
    invokeMock.mockResolvedValue({ data: { success: true }, error: null });
    await expect(emitirDocumento(payload)).resolves.toEqual({ success: true });
  });
});
