import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const rows = [
  // 2 segmentos da mesma semana (troca de viatura a meio) — devem somar numa linha só.
  {
    semana_inicio: '2026-07-06',
    semana_fim: '2026-07-12',
    custo_aluguer: 150,
    receita_bolt: 100,
    receita_uber: 200,
    receita_outras: 0,
    despesa_caucao: 0,
    despesa_seguros: 0,
    despesa_outros: 0,
  },
  {
    semana_inicio: '2026-07-06',
    semana_fim: '2026-07-12',
    custo_aluguer: 150,
    receita_bolt: 50,
    receita_uber: 0,
    receita_outras: 0,
    despesa_caucao: 20,
    despesa_seguros: 0,
    despesa_outros: 0,
  },
];

vi.mock('@/integrations/supabase/client', () => {
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: rows, error: null }),
  };
  return { supabase: { from: () => builder } };
});

import { useMotoristaResumoSemanal } from './useMotoristaResumoSemanal';

describe('useMotoristaResumoSemanal', () => {
  it('agrega segmentos da mesma semana numa linha só', async () => {
    const { result } = renderHook(() => useMotoristaResumoSemanal('m1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.semanas).toHaveLength(1);
    const s = result.current.semanas[0];
    expect(s.custoAluguer).toBeCloseTo(300, 2);
    expect(s.receitaBolt).toBeCloseTo(150, 2);
    expect(s.receitaUber).toBeCloseTo(200, 2);
    expect(s.despesaCaucao).toBeCloseTo(20, 2);
    expect(s.receitaTotal).toBeCloseTo(350, 2); // bolt+uber+outras
    expect(s.despesaTotal).toBeCloseTo(320, 2); // custoAluguer+caucao+seguros+outros
    expect(s.saldo).toBeCloseTo(30, 2);
  });

  it('não corre sem motoristaId', () => {
    const { result } = renderHook(() => useMotoristaResumoSemanal(undefined));
    expect(result.current.loading).toBe(false);
    expect(result.current.semanas).toHaveLength(0);
  });
});
