import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

import { supabase } from '@/integrations/supabase/client';
import {
  linhaDebitoKmExcedente,
  useFecharContrato,
  type FecharContratoArgs,
} from './useContratosRenting';

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

const comExcedente = {
  data: { km_percorridos: 2500, km_excedente: 500, valor: 62.5 },
  error: null,
};
const semExcedente = {
  data: { km_percorridos: 1500, km_excedente: 0, valor: 0 },
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

describe('linhaDebitoKmExcedente', () => {
  it('débito pendente com o contrato e os km na descrição', () => {
    expect(
      linhaDebitoKmExcedente({
        motoristaId: 'mot-1',
        contratoCodigo: 77,
        kmExcedente: 500,
        valor: 62.5,
        dataMovimento: '2026-10-28',
      })
    ).toEqual({
      motorista_id: 'mot-1',
      tipo: 'debito',
      categoria: 'outro',
      descricao: 'Km extra no fecho do contrato #77 (500 km)',
      valor: 62.5,
      data_movimento: '2026-10-28',
      status: 'pendente',
    });
  });
});

describe('useFecharContrato — km extra', () => {
  beforeEach(() => vi.clearAllMocks());

  it('com excedente → lança na BD e debita o motorista', async () => {
    const { chains, rpc } = setupSupabase(comExcedente);
    await fechar(args());

    expect(rpc).toHaveBeenCalledWith('lancar_km_excedente_fecho', {
      p_contrato_id: 'c1',
      p_cobrar: true,
    });
    expect(chains.motorista_financeiro.insert).toHaveBeenCalledWith(
      expect.objectContaining({ motorista_id: 'mot-1', tipo: 'debito', valor: 62.5 })
    );
  });

  // A conta usa o km_entrada que a BD já tem: tem de vir depois de o gravar.
  it('lança depois de gravar o km de entrada', async () => {
    const { chains, rpc } = setupSupabase(comExcedente);
    await fechar(args());

    const kmGravado = chains.contratos_renting.update.mock.invocationCallOrder[0];
    expect(rpc.mock.invocationCallOrder[0]).toBeGreaterThan(kmGravado);
  });

  it('dentro do limite → nenhum débito', async () => {
    const { chains } = setupSupabase(semExcedente);
    await fechar(args());
    expect(chains.motorista_financeiro).toBeUndefined();
  });

  it('gestor perdoa → p_cobrar=false e nenhum débito', async () => {
    const { chains, rpc } = setupSupabase(semExcedente);
    await fechar(args({ cobrarKmExcedente: false }));

    expect(rpc).toHaveBeenCalledWith('lancar_km_excedente_fecho', {
      p_contrato_id: 'c1',
      p_cobrar: false,
    });
    expect(chains.motorista_financeiro).toBeUndefined();
  });

  it('sem motorista → fica só a linha no contrato', async () => {
    const { chains, rpc } = setupSupabase(comExcedente);
    await fechar(args({ motoristaId: null }));

    expect(rpc).toHaveBeenCalled();
    expect(chains.motorista_financeiro).toBeUndefined();
  });

  it('erro no cálculo → o contrato não fecha', async () => {
    const { chains } = setupSupabase({ data: null, error: { message: 'Sem permissão.' } });
    const result = renderFecho();
    await act(async () => {
      await expect(result.current.mutateAsync(args())).rejects.toBeTruthy();
    });

    expect(chains.contratos_renting.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ estado_operacional: 'fechado' })
    );
  });

  it('sem recolha → não calcula km extra', async () => {
    const { rpc } = setupSupabase(semExcedente);
    await fechar(args({ recolha: undefined }));
    expect(rpc).not.toHaveBeenCalled();
  });
});
