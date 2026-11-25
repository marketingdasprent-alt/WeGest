import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const usePeriodoFechado = vi.fn();
vi.mock('@/hooks/usePeriodoFechado', () => ({
  usePeriodoFechado: (...a: unknown[]) => usePeriodoFechado(...a),
}));
const useContasResumoSemana = vi.fn();
vi.mock('@/hooks/useContasResumoSemana', () => ({
  useContasResumoSemana: (...a: unknown[]) => useContasResumoSemana(...a),
}));

import { useResumoSemanalMotorista, totaisDoResumo } from './useResumoSemanalMotorista';

const INI = new Date(2026, 10, 16);
const FIM = new Date(2026, 10, 22);
const linha = (motorista_id: string, liquido: number) =>
  ({
    motorista_id,
    total_faturado: 300,
    faturado_bolt: 100,
    faturado_uber: 150,
    aluguer: 100,
    combustivel: 20,
    portagens: 5,
    reparacoes: 0,
    outros_custos: 10,
    slot: 15,
    liquido,
  }) as never;

describe('useResumoSemanalMotorista', () => {
  beforeEach(() => {
    usePeriodoFechado.mockReturnValue([true, vi.fn()]);
    useContasResumoSemana.mockReturnValue({
      resumos: [linha('outro', 1), linha('m1', 150)],
      loading: false,
    });
  });

  it('usa a conta da lista de Contas/Resumo, só leitura, e devolve a linha do motorista', () => {
    const { result } = renderHook(() => useResumoSemanalMotorista('m1', INI, FIM, true));
    expect(useContasResumoSemana).toHaveBeenLastCalledWith(INI, FIM, true, { soLeitura: true });
    expect(result.current.resumo).toMatchObject({ motorista_id: 'm1', liquido: 150 });
  });

  it('sem acesso ao Financeiro, a conta não corre', () => {
    renderHook(() => useResumoSemanalMotorista('m1', INI, FIM, false));
    expect(useContasResumoSemana).toHaveBeenLastCalledWith(INI, FIM, false, { soLeitura: true });
  });

  it('a carregar enquanto não se sabe se a semana está fechada', () => {
    usePeriodoFechado.mockReturnValue([null, vi.fn()]);
    const { result } = renderHook(() => useResumoSemanalMotorista('m1', INI, FIM, true));
    expect(result.current.loading).toBe(true);
  });
});

describe('totaisDoResumo', () => {
  it('custos incluem portagens e slot, como na lista', () => {
    expect(totaisDoResumo(linha('m1', 150))).toEqual({
      faturado: 300,
      bolt: 100,
      uber: 150,
      outras: 50,
      custos: 150,
      liquido: 150,
    });
  });

  it('sem linha: zeros', () => {
    expect(totaisDoResumo(null).liquido).toBe(0);
  });
});
