import { describe, it, expect, beforeEach, vi } from 'vitest';

import { gerarContratoAtomico } from './useContratos';
import { supabase } from '@/integrations/supabase/client';

/**
 * `gerarContratoAtomico` é o caminho crítico de criação de contratos (RPC
 * atómica que cria/versiona contrato + liga viatura/evento). Testa-se o
 * mapeamento camelCase → p_* , defaults, inclusão condicional de opcionais,
 * desempacotamento de array e propagação de erros.
 */

function mockRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  (supabase as unknown as { rpc: unknown }).rpc = rpc;
  return rpc;
}

const baseParams = {
  motoristaId: 'm1',
  empresaId: 'e1',
  motoristaNome: 'João Silva',
  cidadeAssinatura: 'Leiria',
  dataAssinatura: '2026-01-01',
  dataInicio: '2026-01-01',
};

const okRow = { id: 'c1', numero_contrato: 1, versao: 1 };

describe('gerarContratoAtomico', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chama a RPC correta e mapeia camelCase → p_* com defaults', async () => {
    const rpc = mockRpc({ data: okRow, error: null });

    const r = await gerarContratoAtomico(baseParams);

    expect(r.id).toBe('c1');
    const [fn, params] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe('gerar_contrato_atomico');
    expect(params.p_motorista_id).toBe('m1');
    expect(params.p_empresa_id).toBe('e1');
    expect(params.p_data_inicio).toBe('2026-01-01');
    // defaults
    expect(params.p_duracao_meses).toBe(12);
    expect(params.p_force_new_version).toBe(false);
    expect(params.p_motorista_nif).toBeNull();
  });

  it('inclui opcionais apenas quando passados', async () => {
    const rpc = mockRpc({ data: okRow, error: null });

    await gerarContratoAtomico({
      ...baseParams,
      viaturaId: 'v1',
      calendarioEventoId: 'ev1',
      checkoutPendente: true,
    });

    const params = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(params.p_viatura_id).toBe('v1');
    expect(params.p_calendario_evento_id).toBe('ev1');
    expect(params.p_checkout_pendente).toBe(true);
  });

  it('omite opcionais quando não passados (não envia chaves undefined)', async () => {
    const rpc = mockRpc({ data: okRow, error: null });

    await gerarContratoAtomico(baseParams);

    const params = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect('p_viatura_id' in params).toBe(false);
    expect('p_calendario_evento_id' in params).toBe(false);
    expect('p_checkout_pendente' in params).toBe(false);
  });

  it('desempacota o primeiro elemento quando a RPC devolve um array', async () => {
    mockRpc({ data: [{ id: 'c2', numero_contrato: 2, versao: 1 }], error: null });

    const r = await gerarContratoAtomico(baseParams);

    expect(r.id).toBe('c2');
    expect(r.numero_contrato).toBe(2);
  });

  it('propaga o erro da RPC', async () => {
    mockRpc({ data: null, error: new Error('falha RPC') });

    await expect(gerarContratoAtomico(baseParams)).rejects.toThrow('falha RPC');
  });

  it('lança quando a RPC não devolve dados', async () => {
    mockRpc({ data: null, error: null });

    await expect(gerarContratoAtomico(baseParams)).rejects.toThrow(/não retornou dados/);
  });
});
