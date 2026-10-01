import { describe, it, expect, vi, beforeEach } from 'vitest';

const { upsert, getUser } = vi.hoisted(() => ({
  upsert: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      if (tabela === 'motorista_liquido_semanal') return { upsert };
      throw new Error(`tabela inesperada: ${tabela}`);
    },
    auth: { getUser },
  },
}));

import { useGravarLiquidoSemanal } from './useGravarLiquidoSemanal';
import { renderHook, waitFor } from '@testing-library/react';

const SEMANA_INICIO = new Date('2026-08-24T00:00:00');
const SEMANA_FIM = new Date('2026-08-30T00:00:00');

function base(over: Partial<Parameters<typeof useGravarLiquidoSemanal>[0]> = {}) {
  return {
    motoristaId: 'm-1',
    motoristaNome: 'Ana Costa',
    liquido: 1599.63,
    semanaInicio: SEMANA_INICIO,
    semanaFim: SEMANA_FIM,
    pronto: true,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } });
  upsert.mockResolvedValue({ error: null });
});

describe('useGravarLiquidoSemanal', () => {
  it('grava o líquido com a semana e o motorista', async () => {
    renderHook(() => useGravarLiquidoSemanal(base()));

    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        motorista_id: 'm-1',
        motorista_nome: 'Ana Costa',
        semana_inicio: '2026-08-24',
        semana_fim: '2026-08-30',
        liquido: 1599.63,
        gravado_por: 'u-1',
      }),
      { onConflict: 'motorista_id,semana_inicio' }
    );
  });

  it('não grava enquanto o resumo não estiver pronto', () => {
    renderHook(() => useGravarLiquidoSemanal(base({ pronto: false })));
    expect(upsert).not.toHaveBeenCalled();
  });

  it('não grava sem motorista', () => {
    renderHook(() => useGravarLiquidoSemanal(base({ motoristaId: null })));
    expect(upsert).not.toHaveBeenCalled();
  });

  it('não regrava o mesmo valor a cada render', async () => {
    const { rerender } = renderHook(() => useGravarLiquidoSemanal(base()));
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('grava de novo quando o valor muda', async () => {
    const { rerender } = renderHook(({ v }) => useGravarLiquidoSemanal(base({ liquido: v })), {
      initialProps: { v: 100 },
    });
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));

    rerender({ v: 250 });
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(2));
    expect(upsert.mock.calls[1][0].liquido).toBe(250);
  });

  it('uma falha a gravar não rebenta o ecrã', async () => {
    upsert.mockResolvedValue({ error: { message: 'falha' } });
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderHook(() => useGravarLiquidoSemanal(base()));

    await waitFor(() => expect(erro).toHaveBeenCalled());
    erro.mockRestore();
  });
});
