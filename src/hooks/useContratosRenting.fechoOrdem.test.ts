import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useFecharContrato, type FecharContratoArgs } from './useContratosRenting';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

/**
 * O fecho não é uma transacção: são pedidos HTTP separados. No #764 a ordem
 * era contrato→fechado, evento, KM, danos — os danos falharam (FK) e ficou um
 * contrato fechado sem danos e 9 eventos "recolha" duplicados, um por
 * tentativa. Estes testes fixam a ordem e a idempotência do evento.
 */

type Resultado = { data: unknown; error: unknown };

/** Builder mínimo do supabase-js: cadeia, `.single()` e thenable. */
function chain(ordem: string[], tabela: string, resultado: Resultado) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit']) c[m] = vi.fn().mockReturnValue(c);
  c.insert = vi.fn().mockImplementation(() => (ordem.push(`insert:${tabela}`), c));
  c.update = vi.fn().mockImplementation(() => (ordem.push(`update:${tabela}`), c));
  c.single = vi.fn().mockResolvedValue(resultado);
  c.maybeSingle = vi.fn().mockResolvedValue(resultado);
  (c as unknown as { then: unknown }).then = (
    res: (v: Resultado) => void,
    rej?: (r: unknown) => void
  ) => Promise.resolve(resultado).then(res, rej);
  return c;
}

function montarSupabase(porTabela: Record<string, Resultado>) {
  const ordem: string[] = [];
  const chains: Record<string, ReturnType<typeof chain>> = {};
  (supabase as unknown as { from: unknown }).from = vi.fn((t: string) => {
    if (!chains[t]) chains[t] = chain(ordem, t, porTabela[t] ?? { data: null, error: null });
    return chains[t];
  });
  (supabase as unknown as { auth: { getSession: unknown } }).auth.getSession = vi
    .fn()
    .mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  (supabase as unknown as { storage: unknown }).storage = {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'x.jpg' }, error: null }),
    }),
  };
  return { ordem, chains };
}

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const args: FecharContratoArgs = {
  contratoId: 'cr-764',
  contratoCodigo: 764,
  tipoEvento: 'recolhido',
  estacaoId: 'e-1',
  dataEvento: '2026-09-28T10:00:00Z',
  motivo: 'Desistência do motorista',
  motoristaId: 'm-1',
  matricula: 'BT-14-UM',
  viaturaId: 'v-1',
  recolha: {
    km: '32438',
    combustivel: '1/2',
    danos: [
      {
        descricao: 'Parachoque',
        localizacao: 'frente',
        valor: 120,
        // Já no bucket: subiu quando foi escolhida.
        files: [{ path: 'rascunho/contrato-764/1.jpg', nome: '1.jpg' }],
      },
    ],
  },
};

const base = {
  estacoes: { data: { nome: 'Leiria', cidade: 'Leiria' }, error: null },
  contratos_renting: { data: { regime: 'rent_a_car', data_fim: null }, error: null },
  viaturas: { data: null, error: null },
  viatura_dano_fotos: { data: null, error: null },
};

async function fechar(porTabela: Record<string, Resultado>) {
  const sb = montarSupabase(porTabela);
  const { result } = renderHook(() => useFecharContrato(), { wrapper: wrapper() });
  const promessa = result.current.mutateAsync(args);
  return { ...sb, promessa };
}

const fechouContrato = (chains: ReturnType<typeof montarSupabase>['chains']) =>
  (chains.contratos_renting?.update.mock.calls ?? []).some(
    ([payload]) => (payload as { estado_operacional?: string }).estado_operacional === 'fechado'
  );

beforeEach(() => vi.clearAllMocks());

describe('useFecharContrato — ordem e idempotência', () => {
  it('se um dano falhar, o contrato NÃO fica fechado nem nasce evento', async () => {
    const { promessa, chains } = await fechar({
      ...base,
      viatura_danos: { data: null, error: { message: 'violates foreign key constraint' } },
      calendario_eventos: { data: [], error: null },
    });
    await expect(promessa).rejects.toBeTruthy();
    expect(fechouContrato(chains)).toBe(false);
    expect(chains.calendario_eventos?.insert).toBeUndefined();
  });

  it('com tudo gravado, fecha o contrato e cria o evento DEPOIS dos danos', async () => {
    const { promessa, ordem, chains } = await fechar({
      ...base,
      viatura_danos: { data: { id: 'd-1' }, error: null },
      calendario_eventos: { data: [], error: null },
    });
    await expect(promessa).resolves.toEqual({ fechouAgora: true });
    expect(fechouContrato(chains)).toBe(true);
    expect(ordem.indexOf('insert:viatura_danos')).toBeLessThan(
      ordem.lastIndexOf('update:contratos_renting')
    );
    expect(ordem.indexOf('insert:viatura_danos')).toBeLessThan(
      ordem.indexOf('insert:calendario_eventos')
    );
    expect(chains.calendario_eventos.insert.mock.calls[0][0]).toMatchObject({
      origem_id: 'cr-764',
      criado_por: 'user-1',
    });
    // A foto liga-se pelo caminho que já existe — nada sobe no fecho.
    expect(chains.viatura_dano_fotos.insert).toHaveBeenCalledWith(
      expect.objectContaining({ dano_id: 'd-1', ficheiro_url: 'rascunho/contrato-764/1.jpg' })
    );
    expect((supabase.storage.from as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it('refecho/retentativa actualiza o evento que já existe em vez de duplicar', async () => {
    const { promessa, chains } = await fechar({
      ...base,
      viatura_danos: { data: { id: 'd-1' }, error: null },
      calendario_eventos: { data: [{ id: 'ev-1' }], error: null },
    });
    await promessa;
    expect(chains.calendario_eventos.insert).not.toHaveBeenCalled();
    expect(chains.calendario_eventos.update).toHaveBeenCalledTimes(1);
    expect(chains.calendario_eventos.eq).toHaveBeenCalledWith('id', 'ev-1');
  });
});
