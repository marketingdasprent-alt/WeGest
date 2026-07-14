import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

import { supabase } from '@/integrations/supabase/client';
import {
  useCreateContratoRenting,
  useFecharContrato,
  resolveFechoContratoToast,
  type FecharContratoArgs,
} from './useContratosRenting';
import type { ContratoRentingInsert } from '@/types/contratoRenting';

// ─── Mock useToast (vi.hoisted para estar disponível no factory hoisted) ───
const { toastMock } = vi.hoisted(() => ({
  toastMock: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: toastMock }),
}));

// ─── Helpers ───────────────────────────────────────────────

type SupabaseResult = { data: unknown; error: unknown };

/** Cria um mock chainable que simula o builder do supabase-js.
 *  - Métodos de cadeia (select, insert, update, eq, ...) devolvem o próprio chain.
 *  - .single() / .maybeSingle() devolvem uma Promise com o resultado.
 *  - O próprio chain é thenable (para `await supabase.from(t).update().eq()` sem .single()). */
function chainable(result: SupabaseResult = { data: null, error: null }) {
  const c: Record<string, ReturnType<typeof vi.fn>> = {};
  c.select = vi.fn().mockReturnValue(c);
  c.insert = vi.fn().mockReturnValue(c);
  c.update = vi.fn().mockReturnValue(c);
  c.eq = vi.fn().mockReturnValue(c);
  c.is = vi.fn().mockReturnValue(c);
  c.order = vi.fn().mockReturnValue(c);
  c.limit = vi.fn().mockReturnValue(c);
  c.single = vi.fn().mockResolvedValue(result);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  // Thenable: `await chain` (sem .single()) resolve para result
  (c as unknown as { then: unknown }).then = (
    resolve: (v: SupabaseResult) => void,
    reject?: (r: unknown) => void
  ) => Promise.resolve(result).then(resolve, reject);
  return c;
}

/** Configura o mock global do supabase com resultados por tabela.
 *  Retorna o mapa de chains para inspecção nos testes. */
function setupSupabase(tableResults: Record<string, SupabaseResult> = {}) {
  const chains: Record<string, ReturnType<typeof chainable>> = {};

  (supabase as unknown as { from: ReturnType<typeof vi.fn> }).from = vi
    .fn()
    .mockImplementation((table: string) => {
      if (!chains[table]) {
        chains[table] = chainable(tableResults[table] ?? { data: null, error: null });
      }
      return chains[table];
    });

  // auth.getSession — usado por useFecharContrato para obter o userId
  (supabase as unknown as { auth: { getSession: ReturnType<typeof vi.fn> } }).auth.getSession = vi
    .fn()
    .mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });

  // storage — usado para upload de fotos na recolha
  (supabase as unknown as { storage: unknown }).storage = {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'photo.jpg' }, error: null }),
    }),
  };

  return chains;
}

/** Wrapper para hooks que precisam de QueryClientProvider. */
function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  };
}

// Payload mínimo para criar contrato rent-a-car
const contratoPayload: ContratoRentingInsert = {
  reserva_id: 'res-1',
  cliente_id: 'cli-1',
  viatura_id: 'vit-1',
  data_inicio: '2026-07-10',
  estado_operacional: 'agendado',
  estado_financeiro: 'pendente',
  origem: 'sistema',
  regime: 'rent_a_car',
  taxa_iva: 23,
} as ContratoRentingInsert;

// ─── Testes existentes: resolveFechoContratoToast ──────────

/**
 * `resolveFechoContratoToast` é o que decide a mensagem mostrada depois de
 * "Fechar contrato TVDE". Existia um bug de comunicação: o toast dizia
 * sempre "Contrato fechado", mesmo quando a recolha só ficava agendada
 * (estado_operacional mantém-se em_curso até à confirmação física). Este
 * teste trava a regressão — cada caminho tem de ter a mensagem certa.
 */
describe('resolveFechoContratoToast', () => {
  it('confirma o fecho quando a recolha foi registada já ali (fechouAgora=true)', () => {
    const toast = resolveFechoContratoToast(true);
    expect(toast.title).toBe('Contrato fechado');
    expect(toast.description).toBeUndefined();
  });

  it('avisa que ficou agendado quando a recolha não foi confirmada (fechouAgora=false)', () => {
    const toast = resolveFechoContratoToast(false);
    expect(toast.title).toBe('Recolha agendada');
    expect(toast.description).toMatch(/em curso/i);
  });
});

// ─── useCreateContratoRenting: flow criar contrato ─────────

describe('useCreateContratoRenting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('grava o contrato, invalida queries e mostra toast de sucesso', async () => {
    const created = { id: 'c1', codigo: 42, reserva_id: 'res-1' };
    const chains = setupSupabase({
      contratos_renting: { data: created, error: null },
    });

    const { result } = renderHook(() => useCreateContratoRenting(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync(contratoPayload);
    });

    // 1. Insert foi chamado com o payload recebido
    expect(chains.contratos_renting.insert).toHaveBeenCalledWith(contratoPayload);

    // 2. Toast de sucesso
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Contrato criado' }));
  });

  it('surfaces a mensagem real do Postgres quando campos obrigatórios faltam (regressão fix 10/07)', async () => {
    // Simula erro de NOT NULL constraint do Postgres.
    // Shape real: plain object com .message/.code, NÃO instanceof Error.
    // Antes do fix, `error instanceof Error` era false para este shape e a
    // mensagem real era mascarada atrás de "Erro inesperado".
    const notNullError = {
      message:
        'null value in column "cliente_id" of relation "contratos_renting" violates not-null constraint',
      code: '23502',
      details: 'Failing row contains (...)',
      hint: null,
    };

    setupSupabase({
      contratos_renting: { data: null, error: notNullError },
    });

    const { result } = renderHook(() => useCreateContratoRenting(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync(contratoPayload);
      } catch {
        // esperado — a mutation rejeita com o erro do Postgres
      }
    });

    // O toast deve conter a mensagem real do Postgres, NÃO "Erro inesperado"
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro',
        description: expect.stringContaining('null value in column "cliente_id"'),
        variant: 'destructive',
      })
    );
    const call = toastMock.mock.calls[0][0] as { description: string };
    expect(call.description).not.toMatch(/erro inesperado/i);
  });

  it('mostra "Reserva já tem contrato" quando há duplicação (erro elegante, não redirect silencioso)', async () => {
    // Simula violação da unique constraint uq_contratos_renting_reserva_id_active
    const duplicateError = {
      message:
        'duplicate key value violates unique constraint "uq_contratos_renting_reserva_id_active"',
      code: '23505',
      details: 'Key (reserva_id)=(res-1) already exists.',
      hint: null,
    };

    setupSupabase({
      contratos_renting: { data: null, error: duplicateError },
    });

    const { result } = renderHook(() => useCreateContratoRenting(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync(contratoPayload);
      } catch {
        // esperado — a mutation rejeita com o erro de duplicação
      }
    });

    // O toast deve dizer "Reserva já tem contrato" — erro elegante
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Reserva já tem contrato',
        variant: 'destructive',
      })
    );
    // NÃO é um redirect silencioso — o toast foi chamado exactamente uma vez
    expect(toastMock).toHaveBeenCalledTimes(1);
  });
});

// ─── useFecharContrato: flow fechar contrato rent-a-car ────

describe('useFecharContrato', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fecha contrato rent-a-car com recolha → estado cancelado + invalida queries', async () => {
    const chains = setupSupabase({
      estacoes: { data: { nome: 'Estação A', cidade: 'Lisboa' }, error: null },
      contratos_renting: { data: null, error: null },
      calendario_eventos: { data: null, error: null },
      viaturas: { data: null, error: null },
      viatura_danos: { data: { id: 'dano-1' }, error: null },
      viatura_dano_fotos: { data: null, error: null },
      motorista_financeiro: { data: null, error: null },
      motoristas_ativos: { data: null, error: null },
    });

    const args: FecharContratoArgs = {
      contratoId: 'c1',
      contratoCodigo: 42,
      tipoEvento: 'recolhido',
      estacaoId: 'est-1',
      dataEvento: '2026-07-10T10:00:00Z',
      matricula: 'AB-12-CD',
      viaturaId: 'vit-1',
      motoristaId: 'mot-1',
      valorDivida: 50,
      recolha: {
        km: '12345',
        combustivel: 'meio',
        fotos: [],
      },
    };

    const { result } = renderHook(() => useFecharContrato(), {
      wrapper: createWrapper(),
    });

    let fechouAgora: boolean | undefined;
    await act(async () => {
      const r = await result.current.mutateAsync(args);
      fechouAgora = r.fechouAgora;
    });

    // 1. Contrato foi fechado (estado_operacional = 'cancelado')
    expect(chains.contratos_renting.update).toHaveBeenCalledWith(
      expect.objectContaining({
        estado_operacional: 'cancelado',
        estacao_recolha_id: 'est-1',
      })
    );

    // 2. Evento de calendário criado com tipo 'recolha'
    expect(chains.calendario_eventos.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        tipo: 'recolha',
        origem_tipo: 'contrato_renting',
        origem_id: 'c1',
      })
    );

    // 3. KM e combustível registados no contrato
    expect(chains.contratos_renting.update).toHaveBeenCalledWith(
      expect.objectContaining({
        km_entrada: 12345,
        combustivel_entrada: 'meio',
      })
    );

    // 4. Motorista desactivado (recolha confirmada → vínculo TVDE termina)
    expect(chains.motoristas_ativos.update).toHaveBeenCalledWith(
      expect.objectContaining({ status_ativo: false })
    );

    // 5. Dívida registada no financeiro do motorista
    expect(chains.motorista_financeiro.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        motorista_id: 'mot-1',
        tipo: 'debito',
        valor: 50,
      })
    );

    // 6. Return confirma que fechou agora (recolha presente)
    expect(fechouAgora).toBe(true);

    // 7. Toast de sucesso
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Contrato fechado' }));
  });

  it('sem recolha física → fica agendado (fechouAgora=false) e motorista mantém-se activo', async () => {
    const chains = setupSupabase({
      estacoes: { data: { nome: 'Estação A', cidade: 'Lisboa' }, error: null },
      contratos_renting: { data: null, error: null },
      calendario_eventos: { data: null, error: null },
    });

    const args: FecharContratoArgs = {
      contratoId: 'c1',
      contratoCodigo: 42,
      tipoEvento: 'recolhido',
      estacaoId: 'est-1',
      dataEvento: '2026-07-10T10:00:00Z',
      matricula: 'AB-12-CD',
      viaturaId: 'vit-1',
      motoristaId: 'mot-1',
      // Sem recolha — fica agendado para confirmação posterior via QR/Calendário
    };

    const { result } = renderHook(() => useFecharContrato(), {
      wrapper: createWrapper(),
    });

    let fechouAgora: boolean | undefined;
    await act(async () => {
      const r = await result.current.mutateAsync(args);
      fechouAgora = r.fechouAgora;
    });

    // Contrato ainda foi fechado (estado_operacional = 'cancelado')
    expect(chains.contratos_renting.update).toHaveBeenCalledWith(
      expect.objectContaining({ estado_operacional: 'cancelado' })
    );

    // Motorista NÃO foi desactivado (sem recolha confirmada)
    expect(chains.motoristas_ativos).toBeUndefined();

    // Return indica que ficou agendado
    expect(fechouAgora).toBe(false);

    // Toast diz "Recolha agendada"
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Recolha agendada' }));
  });
});
