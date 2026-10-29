import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

import { supabase } from '@/integrations/supabase/client';
import { useFecharContrato, type FecharContratoArgs } from './useContratosRenting';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

type SupabaseResult = { data: unknown; error: unknown };

/** Builder do supabase-js: tudo encadeia, .single() e o próprio chain resolvem. */
function chainable(result: SupabaseResult) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ['select', 'insert', 'update', 'eq', 'order', 'limit']) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  c.single = vi.fn().mockResolvedValue(result);
  (c as unknown as { then: unknown }).then = (
    resolve: (v: SupabaseResult) => void,
    reject?: (r: unknown) => void
  ) => Promise.resolve(result).then(resolve, reject);
  return c;
}

function setupSupabase(rpcResult: SupabaseResult) {
  const chains: Record<string, ReturnType<typeof chainable>> = {};
  const client = supabase as unknown as Record<string, unknown>;
  client.from = vi.fn().mockImplementation((table: string) => {
    chains[table] ??= chainable(
      table === 'estacoes'
        ? { data: { nome: 'Estação A', cidade: 'Lisboa' }, error: null }
        : { data: null, error: null }
    );
    return chains[table];
  });
  client.rpc = vi.fn().mockResolvedValue(rpcResult);
  (client.auth as { getSession: unknown }).getSession = vi
    .fn()
    .mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  return { chains, rpc: client.rpc as ReturnType<typeof vi.fn> };
}

const previsao = {
  data: { km_percorridos: 2500, km_excedente: 500, valor_previsto: 62.5 },
  error: null,
};

const args = (extra: Partial<FecharContratoArgs> = {}): FecharContratoArgs => ({
  contratoId: 'c1',
  contratoCodigo: 77,
  tipoEvento: 'devolvido',
  estacaoId: 'est-1',
  dataEvento: '2026-10-28T10:00:00Z',
  viaturaId: 'vit-1',
  motoristaId: 'mot-1',
  recolha: { km: '12500', combustivel: 'meio', fotos: [] },
  ...extra,
});

function renderFecho() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
  return renderHook(() => useFecharContrato(), { wrapper }).result;
}

const fechar = async (a: FecharContratoArgs) => {
  const result = renderFecho();
  await act(async () => {
    await result.current.mutateAsync(a);
  });
};

describe('useFecharContrato — km extra', () => {
  beforeEach(() => vi.clearAllMocks());

  // Quem lança é o trigger ao fechar, pelo canal do regime; o cliente só
  // regista a escolha — debitar aqui cobrava o TVDE duas vezes.
  it('regista a escolha na BD e não debita nada do lado do cliente', async () => {
    const { chains, rpc } = setupSupabase(previsao);
    await fechar(args());

    expect(rpc).toHaveBeenCalledWith('lancar_km_excedente_fecho', {
      p_contrato_id: 'c1',
      p_cobrar: true,
    });
    expect(chains.motorista_financeiro).toBeUndefined();
  });

  it('gestor perdoa → p_cobrar=false', async () => {
    const { rpc } = setupSupabase(previsao);
    await fechar(args({ cobrarKmExcedente: false }));
    expect(rpc).toHaveBeenCalledWith('lancar_km_excedente_fecho', {
      p_contrato_id: 'c1',
      p_cobrar: false,
    });
  });

  // A escolha tem de estar gravada antes do update que fecha (é ele que dispara o trigger).
  it('regista a escolha depois do km e antes de fechar', async () => {
    const { chains, rpc } = setupSupabase(previsao);
    await fechar(args());

    const updates = chains.contratos_renting.update.mock;
    const fecho = updates.calls.findIndex(([p]) => p.estado_operacional === 'fechado');
    const ordemRpc = rpc.mock.invocationCallOrder[0];
    expect(ordemRpc).toBeGreaterThan(updates.invocationCallOrder[0]);
    expect(ordemRpc).toBeLessThan(updates.invocationCallOrder[fecho]);
  });

  it('erro a registar a escolha → o contrato não fecha', async () => {
    const { chains } = setupSupabase({ data: null, error: { message: 'Sem permissão.' } });
    const result = renderFecho();
    await act(async () => {
      await expect(result.current.mutateAsync(args())).rejects.toBeTruthy();
    });

    expect(chains.contratos_renting.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ estado_operacional: 'fechado' })
    );
  });

  // Vai no update do km, antes do que fecha: o trigger calcula com o valor certo.
  it('km de saída corrigido grava-se antes de fechar', async () => {
    const { chains } = setupSupabase(previsao);
    await fechar(
      args({ recolha: { km: '98500', kmSaidaCorrigido: 97785, combustivel: 'meio', fotos: [] } })
    );

    const updates = chains.contratos_renting.update.mock;
    const correcao = updates.calls.findIndex(([p]) => p.km_saida === 97785);
    const fecho = updates.calls.findIndex(([p]) => p.estado_operacional === 'fechado');
    expect(updates.calls[correcao][0]).toMatchObject({ km_entrada: 98500 });
    expect(correcao).toBeLessThan(fecho);
  });

  it('sem correcção não toca no km de saída', async () => {
    const { chains } = setupSupabase(previsao);
    await fechar(args());
    for (const [p] of chains.contratos_renting.update.mock.calls) {
      expect(p).not.toHaveProperty('km_saida');
    }
  });

  it('sem recolha → não mexe nos km extra', async () => {
    const { rpc } = setupSupabase(previsao);
    await fechar(args({ recolha: undefined }));
    expect(rpc).not.toHaveBeenCalled();
  });
});
