import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

import { supabase } from '@/integrations/supabase/client';
import {
  useCreateContratoRenting,
  useCriarVersaoContrato,
  useFecharContrato,
  usePreencherDadosSaidaAnyRent,
  useReverterFecho,
  resolveFechoContratoToast,
  type FecharContratoArgs,
  type ReverterFechoArgs,
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
  c.in = vi.fn().mockReturnValue(c);
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

  it('fecha contrato rent-a-car com recolha → estado fechado + tipo_fecho + invalida queries', async () => {
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

    // 1. Contrato foi FECHADO — não cancelado. Fechar e cancelar deixaram de
    //    partilhar estado (ver 20260820150000): cancelar é só para o que nunca
    //    saiu, e o fecho semanal exclui 'cancelado'. O tipoEvento escolhido no
    //    diálogo passa a ficar guardado em tipo_fecho, em vez de ser deitado fora.
    expect(chains.contratos_renting.update).toHaveBeenCalledWith(
      expect.objectContaining({
        estado_operacional: 'fechado',
        tipo_fecho: 'recolhido',
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

  it('troca de viatura (manterMotoristaActivo) → fecha com recolha mas NÃO desactiva o motorista', async () => {
    // Sentinela da regra: numa troca/upgrade/downgrade o motorista não sai —
    // passa para o contrato sucessor com outra viatura. Desactivá-lo aqui
    // fazia-o desaparecer dos resumos semanais e das listas de cobrança na
    // janela entre o fecho e a criação do sucessor (e, se algo falhasse a
    // meio dos três round-trips da troca, ficava inactivo para sempre).
    const chains = setupSupabase({
      estacoes: { data: { nome: 'Estação A', cidade: 'Lisboa' }, error: null },
      contratos_renting: { data: null, error: null },
      calendario_eventos: { data: null, error: null },
      viatura_danos: { data: { id: 'dano-1' }, error: null },
    });

    const args: FecharContratoArgs = {
      contratoId: 'c1',
      contratoCodigo: 42,
      tipoEvento: 'recolhido',
      estacaoId: 'est-1',
      dataEvento: '2026-08-20T10:00:00Z',
      matricula: 'AB-12-CD',
      viaturaId: 'vit-1',
      motoristaId: 'mot-1',
      recolha: { km: '12345', combustivel: 'meio', fotos: [] },
      manterMotoristaActivo: true,
    };

    const { result } = renderHook(() => useFecharContrato(), {
      wrapper: createWrapper(),
    });

    let fechouAgora: boolean | undefined;
    await act(async () => {
      const r = await result.current.mutateAsync(args);
      fechouAgora = r.fechouAgora;
    });

    // O contrato fecha na mesma — a troca exige o fecho formal do elo antigo.
    // 'fechado', não 'cancelado': o elo antigo aconteceu e é facturável.
    expect(chains.contratos_renting.update).toHaveBeenCalledWith(
      expect.objectContaining({ estado_operacional: 'fechado' })
    );
    // …e a recolha física fica registada (é a folha de danos de devolução).
    expect(chains.contratos_renting.update).toHaveBeenCalledWith(
      expect.objectContaining({ km_entrada: 12345, combustivel_entrada: 'meio' })
    );
    // Mas o motorista continua activo.
    expect(chains.motoristas_ativos).toBeUndefined();
    expect(fechouAgora).toBe(true);
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

    // Contrato ainda foi fechado (estado_operacional = 'fechado')
    expect(chains.contratos_renting.update).toHaveBeenCalledWith(
      expect.objectContaining({ estado_operacional: 'fechado' })
    );

    // Motorista NÃO foi desactivado (sem recolha confirmada)
    expect(chains.motoristas_ativos).toBeUndefined();

    // Return indica que ficou agendado
    expect(fechouAgora).toBe(false);

    // Toast diz "Recolha agendada"
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Recolha agendada' }));
  });

  it('sem recolha mas fecharAgora=true (viatura slot) → fecha definitivamente e desactiva o motorista', async () => {
    const chains = setupSupabase({
      estacoes: { data: { nome: 'Estação A', cidade: 'Lisboa' }, error: null },
      contratos_renting: { data: null, error: null },
      calendario_eventos: { data: null, error: null },
      motoristas_ativos: { data: null, error: null },
    });

    const args: FecharContratoArgs = {
      contratoId: 'c1',
      contratoCodigo: 42,
      tipoEvento: 'devolvido',
      estacaoId: 'est-1',
      dataEvento: '2026-07-10T10:00:00Z',
      matricula: 'AB-12-CD',
      viaturaId: 'vit-1',
      motoristaId: 'mot-1',
      fecharAgora: true,
      // Sem recolha — fecho simplificado de viatura slot (só data + motivo).
    };

    const { result } = renderHook(() => useFecharContrato(), {
      wrapper: createWrapper(),
    });

    let fechouAgora: boolean | undefined;
    await act(async () => {
      const r = await result.current.mutateAsync(args);
      fechouAgora = r.fechouAgora;
    });

    // Contrato fechado (estado_operacional = 'fechado'), como qualquer fecho.
    expect(chains.contratos_renting.update).toHaveBeenCalledWith(
      expect.objectContaining({ estado_operacional: 'fechado' })
    );

    // Motorista desactivado mesmo sem recolha física — fecharAgora força o
    // fecho a ser tratado como definitivo (é isto que estava em falta antes
    // desta flag existir: o slot fechava o contrato mas deixava o motorista
    // "Ativo" para sempre).
    expect(chains.motoristas_ativos.update).toHaveBeenCalledWith(
      expect.objectContaining({ status_ativo: false })
    );

    expect(fechouAgora).toBe(true);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Contrato fechado' }));
  });
});

// ─── usePreencherDadosSaidaAnyRent: preenchimento manual (Any Rent) ────

describe('usePreencherDadosSaidaAnyRent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('grava km/combustível/bateria de saída no contrato', async () => {
    const chains = setupSupabase({
      contratos_renting: { data: null, error: null },
    });
    (supabase.auth as unknown as { getUser: ReturnType<typeof vi.fn> }).getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const { result } = renderHook(() => usePreencherDadosSaidaAnyRent(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        contratoId: 'c1',
        kmSaida: 45120,
        combustivelSaida: '3/4',
        eletricidadeSaida: null,
      });
    });

    expect(chains.contratos_renting.update).toHaveBeenCalledWith(
      expect.objectContaining({
        km_saida: 45120,
        combustivel_saida: '3/4',
        eletricidade_saida: null,
      })
    );
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Dados de saída preenchidos' })
    );
  });

  it('surfaces o erro do Postgres no toast quando o update falha', async () => {
    const dbError = { message: 'some constraint violated', code: '23514', details: '', hint: null };
    setupSupabase({
      contratos_renting: { data: null, error: dbError },
    });
    (supabase.auth as unknown as { getUser: ReturnType<typeof vi.fn> }).getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const { result } = renderHook(() => usePreencherDadosSaidaAnyRent(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      try {
        await result.current.mutateAsync({
          contratoId: 'c1',
          kmSaida: 45120,
          combustivelSaida: '3/4',
          eletricidadeSaida: null,
        });
      } catch {
        // esperado
      }
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Erro',
        description: expect.stringContaining('some constraint violated'),
        variant: 'destructive',
      })
    );
  });
});

describe('useReverterFecho', () => {
  const contrato: ReverterFechoArgs = {
    id: 'contrato-1',
    codigo: 101,
    regime: 'rent_a_car',
    matricula: 'AA-00-BB',
    data_fim: '2026-08-20',
    estacao_recolha_id: null,
    reserva_id: 'res-1',
  } as ReverterFechoArgs;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * REGRESSÃO (type-check:strict, 2026-08-26)
   *
   * `criado_por` em calendario_eventos é NOT NULL sem default. Esta mutation
   * lia `user?.id ?? null` SEM a guarda que a mutation irmã (useFecharContrato)
   * já tinha, e seguia em frente. Com a sessão expirada isso dava:
   *
   *   1. o contrato era reaberto para 'em_curso' (update passa, updated_by NULL
   *      — perde-se o rasto de quem reverteu);
   *   2. o insert do evento de recolha rebentava na constraint NOT NULL.
   *
   * São duas chamadas PostgREST separadas, sem transação: ficava um contrato
   * reaberto SEM evento de recolha pendente — estado parcial, e a recolha
   * desaparecia do calendário.
   */
  it('sem sessão activa falha ANTES de reabrir o contrato (não deixa estado parcial)', async () => {
    const chains = setupSupabase();
    (supabase.auth as unknown as { getUser: ReturnType<typeof vi.fn> }).getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: null } });

    const { result } = renderHook(() => useReverterFecho(), { wrapper: createWrapper() });

    // Captura-se a rejeição directamente em vez de ler `result.current.error`:
    // esse estado do React Query só aparece no render seguinte, e a leitura
    // síncrona dava `null` mesmo com a mutation a rejeitar — mascarava o que o
    // teste quer provar.
    let erro: unknown;
    await act(async () => {
      erro = await result.current.mutateAsync(contrato).catch((e: unknown) => e);
    });

    expect(erro).toEqual(new Error('Sessão não encontrada'));
    // Nenhuma tabela pode ter sido tocada — nem sequer aberta. É isso que
    // garante que não fica estado parcial: sem a guarda, o contrato era
    // reaberto e só depois o insert do evento rebentava.
    // (`chains` só ganha entradas quando `supabase.from(t)` é chamado.)
    expect(supabase.from).not.toHaveBeenCalled();
    expect(chains['contratos_renting']).toBeUndefined();
  });

  it('com sessão activa grava quem reverteu em updated_by', async () => {
    const chains = setupSupabase({
      contratos_renting: { data: { id: 'contrato-1' }, error: null },
    });
    (supabase.auth as unknown as { getUser: ReturnType<typeof vi.fn> }).getUser = vi
      .fn()
      .mockResolvedValue({ data: { user: { id: 'user-9' } } });

    const { result } = renderHook(() => useReverterFecho(), { wrapper: createWrapper() });

    await act(async () => {
      try {
        await result.current.mutateAsync(contrato);
      } catch {
        /* o resto do fluxo não interessa a este teste */
      }
    });

    expect(chains['contratos_renting'].update).toHaveBeenCalledWith(
      expect.objectContaining({ estado_operacional: 'em_curso', updated_by: 'user-9' })
    );
  });
});

// ─── useCriarVersaoContrato: a causa real não pode ficar escondida ───

/**
 * Uma troca de viatura falhava com o toast "Erro inesperado" e mais nada. A
 * causa real vinha do Postgres — o contrato #577 tinha `data_fim` já no
 * passado, e a RPC montava o sucessor com `data_inicio` = data da troca e
 * `data_fim` = a data antiga, o que inverte o `periodo` (coluna gerada
 * `tstzrange(data_inicio, data_fim, '[)')`) e rebenta com
 * "range lower bound must be less than or equal to range upper bound".
 *
 * Essa mensagem nunca chegou ao ecrã: o hook usava `error instanceof Error`,
 * e um PostgrestError é um objecto plain. Mesma armadilha que o fix de 10/07
 * já tinha arrumado em useCreateContratoRenting — este hook ficou de fora.
 */
describe('useCriarVersaoContrato', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra a mensagem real do Postgres quando a RPC falha (não "Erro inesperado")', async () => {
    // Shape real de um erro do Supabase: plain object, NÃO instanceof Error.
    const rangeError = {
      message: 'range lower bound must be less than or equal to range upper bound',
      code: '22000',
      details: null,
      hint: null,
    };
    setupSupabase();
    (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: rangeError });

    const { result } = renderHook(() => useCriarVersaoContrato(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current
        .mutateAsync({ contratoId: 'c-577', motivo: 'Manutenção' })
        .catch(() => undefined);
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining('range lower bound'),
        variant: 'destructive',
      })
    );
    const call = toastMock.mock.calls[0][0] as { description: string };
    expect(call.description).not.toMatch(/erro inesperado/i);
  });

  it('reconhece um conflito de disponibilidade em vez de despejar o texto cru', async () => {
    setupSupabase();
    (supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        message: 'conflicting key value violates exclusion constraint "contratos_no_overbooking"',
        code: '23P01',
        details: null,
        hint: null,
      },
    });

    const { result } = renderHook(() => useCriarVersaoContrato(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current
        .mutateAsync({ contratoId: 'c-577', motivo: 'Manutenção' })
        .catch(() => undefined);
    });

    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Conflito de disponibilidade', variant: 'destructive' })
    );
  });
});
