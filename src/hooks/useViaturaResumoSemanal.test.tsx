import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const rows = [
  {
    id: 'r2',
    semana_inicio: '2026-07-13',
    semana_fim: '2026-07-19',
    receita_aluguer: 300,
    receita_outros: 0,
    despesa_combustivel: 40,
    despesa_portagens: 5,
    despesa_danos: 0,
    despesa_outros: 10,
  },
  {
    id: 'r1',
    semana_inicio: '2026-07-06',
    semana_fim: '2026-07-12',
    receita_aluguer: 300,
    receita_outros: 20,
    despesa_combustivel: 35,
    despesa_portagens: 0,
    despesa_danos: 50,
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

import { useViaturaResumoSemanal } from './useViaturaResumoSemanal';

describe('useViaturaResumoSemanal', () => {
  it('devolve as semanas com os totais calculados', async () => {
    const { result } = renderHook(() => useViaturaResumoSemanal('v1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.semanas).toHaveLength(2);
    expect(result.current.semanas[0].receitaTotal).toBeCloseTo(300, 2);
    expect(result.current.semanas[0].despesaTotal).toBeCloseTo(55, 2);
    expect(result.current.semanas[0].saldo).toBeCloseTo(245, 2);
  });

  it('não corre sem viaturaId', () => {
    const { result } = renderHook(() => useViaturaResumoSemanal(undefined));
    expect(result.current.loading).toBe(false);
    expect(result.current.semanas).toHaveLength(0);
  });
});
