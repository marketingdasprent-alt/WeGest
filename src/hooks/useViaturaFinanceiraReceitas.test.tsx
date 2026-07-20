import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

let contratos: any[] = [];
let tarifa: any = null;
let viatura: any = null;
let precoModelo: any = null;
let multas: any[] = [];
let reparacoes: any[] = [];

vi.mock('@/integrations/supabase/client', () => {
  const singleBuilder = (getRow: () => any) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      gte: () => builder,
      lte: () => builder,
      maybeSingle: () => Promise.resolve({ data: getRow(), error: null }),
    };
    return builder;
  };
  const listBuilder = (getRows: () => any[]) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      gte: () => builder,
      lte: () => builder,
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: getRows(), error: null }),
    };
    return builder;
  };
  return {
    supabase: {
      from: (table: string) => {
        if (table === 'contratos_renting') return listBuilder(() => contratos);
        if (table === 'renting_tarifas') return singleBuilder(() => tarifa);
        if (table === 'viaturas') return singleBuilder(() => viatura);
        if (table === 'renting_tarifa_precos_modelo') return singleBuilder(() => precoModelo);
        if (table === 'viatura_multas') return listBuilder(() => multas);
        if (table === 'viatura_reparacoes') return listBuilder(() => reparacoes);
        return listBuilder(() => []);
      },
    },
  };
});

import { useViaturaFinanceiraReceitas } from './useViaturaFinanceiraReceitas';

describe('useViaturaFinanceiraReceitas', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-07-17T00:00:00Z'));
    contratos = [];
    tarifa = null;
    viatura = null;
    precoModelo = null;
    multas = [];
    reparacoes = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sem contrato ativo (agendado/em_curso) → tudo a 0', async () => {
    const { result } = renderHook(() => useViaturaFinanceiraReceitas('v1'));
    await waitFor(() => expect(result.current.receitas.loading).toBe(false));
    expect(result.current.receitas.contratoReceita).toBe(0);
    expect(result.current.receitas.contratoRegime).toBeNull();
  });

  it('TVDE: tarifa semanal do grupo × semanas ativas (ceil), sem data_fim', async () => {
    contratos = [
      {
        id: 'c1',
        regime: 'tvde',
        estado_operacional: 'em_curso',
        data_inicio: '2026-07-01',
        data_fim: null,
        tarifa_id: 't1',
        tarifa_diaria: null,
        valor_total_manual: null,
      },
    ];
    tarifa = { preco_semana: 300 };
    // 01/07 → 17/07 (hoje) = 16 dias → ceil(16/7) = 3 semanas
    const { result } = renderHook(() => useViaturaFinanceiraReceitas('v1'));
    await waitFor(() => expect(result.current.receitas.loading).toBe(false));
    expect(result.current.receitas.contratoRegime).toBe('tvde');
    expect(result.current.receitas.contratoReceita).toBeCloseTo(900, 2);
    expect(result.current.receitas.contratoDetalhe).toEqual({
      tipo: 'tvde',
      valorSemanal: 300,
      semanas: 3,
    });
  });

  it('TVDE sem preço de grupo → fallback preço por modelo da viatura', async () => {
    contratos = [
      {
        id: 'c1',
        regime: 'tvde',
        estado_operacional: 'em_curso',
        data_inicio: '2026-07-10',
        data_fim: null,
        tarifa_id: 't1',
        tarifa_diaria: null,
        valor_total_manual: null,
      },
    ];
    tarifa = { preco_semana: null };
    viatura = { modelo_id: 'modelo1' };
    precoModelo = { preco_semana: 280 };
    // 10/07 → 17/07 = 7 dias → 1 semana
    const { result } = renderHook(() => useViaturaFinanceiraReceitas('v1'));
    await waitFor(() => expect(result.current.receitas.loading).toBe(false));
    expect(result.current.receitas.contratoReceita).toBeCloseTo(280, 2);
  });

  it('regressão: com contrato agendado (futuro/sem tarifa) E em_curso ao mesmo tempo, usa o em_curso', async () => {
    // Reserva agendada mais recente (sem tarifa) não deve ganhar ao contrato
    // que está mesmo a decorrer — bug real: .order(data_inicio desc).limit(1)
    // apanhava a reserva agendada em vez do contrato em_curso mais antigo.
    contratos = [
      {
        id: 'agendado-recente',
        regime: 'tvde',
        estado_operacional: 'agendado',
        data_inicio: '2026-07-16',
        data_fim: '2026-08-16',
        tarifa_id: null,
        tarifa_diaria: null,
        valor_total_manual: null,
      },
      {
        id: 'em-curso-antigo',
        regime: 'tvde',
        estado_operacional: 'em_curso',
        data_inicio: '2026-07-01',
        data_fim: null,
        tarifa_id: 't1',
        tarifa_diaria: null,
        valor_total_manual: null,
      },
    ];
    tarifa = { preco_semana: 225 };
    const { result } = renderHook(() => useViaturaFinanceiraReceitas('v1'));
    await waitFor(() => expect(result.current.receitas.loading).toBe(false));
    // 01/07 → 17/07 = 16 dias → 3 semanas × 225 = 675 (não 0)
    expect(result.current.receitas.contratoReceita).toBeCloseTo(675, 2);
  });

  it('regressão: só há contratos agendados (nenhum em_curso), sem tarifa não vence com tarifa', async () => {
    // Vários "agendado" sobrepostos (comum em dados de teste) — o mais
    // recente por data não tem tarifa nenhuma; um mais antigo tem. Deve
    // escolher o que tem tarifa, não o mais recente às cegas.
    contratos = [
      {
        id: 'agendado-sem-tarifa-recente',
        regime: 'tvde',
        estado_operacional: 'agendado',
        data_inicio: '2026-06-23',
        data_fim: '2026-07-23',
        tarifa_id: null,
        tarifa_diaria: null,
        valor_total_manual: null,
      },
      {
        id: 'agendado-com-tarifa-antigo',
        regime: 'tvde',
        estado_operacional: 'agendado',
        data_inicio: '2026-06-12',
        data_fim: '2026-07-12',
        tarifa_id: 't2',
        tarifa_diaria: null,
        valor_total_manual: null,
      },
    ];
    tarifa = { preco_semana: 225 };
    const { result } = renderHook(() => useViaturaFinanceiraReceitas('v1'));
    await waitFor(() => expect(result.current.receitas.loading).toBe(false));
    expect(result.current.receitas.contratoReceita).toBeGreaterThan(0);
  });

  it('rent-a-car: tarifa diária × dias do contrato', async () => {
    contratos = [
      {
        id: 'c2',
        regime: 'rent_a_car',
        estado_operacional: 'em_curso',
        data_inicio: '2026-07-15',
        data_fim: null,
        tarifa_id: null,
        tarifa_diaria: 40,
        valor_total_manual: null,
      },
    ];
    // 15/07 → 17/07 = 2 dias
    const { result } = renderHook(() => useViaturaFinanceiraReceitas('v1'));
    await waitFor(() => expect(result.current.receitas.loading).toBe(false));
    expect(result.current.receitas.contratoRegime).toBe('rent_a_car');
    expect(result.current.receitas.contratoReceita).toBeCloseTo(80, 2);
  });

  it('rent-a-car com valor_total_manual → usa o override, ignora tarifa_diaria', async () => {
    contratos = [
      {
        id: 'c3',
        regime: 'rent_a_car',
        estado_operacional: 'em_curso',
        data_inicio: '2026-07-01',
        data_fim: '2026-07-10',
        tarifa_id: null,
        tarifa_diaria: 999,
        valor_total_manual: 500,
      },
    ];
    const { result } = renderHook(() => useViaturaFinanceiraReceitas('v1'));
    await waitFor(() => expect(result.current.receitas.loading).toBe(false));
    expect(result.current.receitas.contratoReceita).toBe(500);
  });

  it('multas somam todas as devolvidas; danos só contam os que caem dentro do período do contrato', async () => {
    contratos = [
      {
        id: 'c4',
        regime: 'rent_a_car',
        estado_operacional: 'em_curso',
        data_inicio: '2026-07-05',
        data_fim: null,
        tarifa_id: null,
        tarifa_diaria: 0,
        valor_total_manual: 0,
      },
    ];
    multas = [{ valor: 60 }];
    reparacoes = [
      { custo: 150, data_entrada: '2026-07-06', data_saida: '2026-07-08' }, // dentro do período
      { custo: 999, data_entrada: '2026-01-01', data_saida: '2026-01-02' }, // fora, excluído no cliente
    ];
    const { result } = renderHook(() => useViaturaFinanceiraReceitas('v1'));
    await waitFor(() => expect(result.current.receitas.loading).toBe(false));
    expect(result.current.receitas.multas).toBeCloseTo(60, 2);
    expect(result.current.receitas.danos).toBeCloseTo(150, 2);
  });
});
