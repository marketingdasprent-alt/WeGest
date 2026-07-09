import { describe, expect, it } from 'vitest';
import { calcularBaseAluguerRenting } from './useRentingGruposTarifas';

describe('calcularBaseAluguerRenting', () => {
  it('usa o valor semanal para contratos TVDE quando há preço por modelo', () => {
    const base = calcularBaseAluguerRenting({
      regime: 'tvde',
      isLongaDuracao: false,
      dias: 7,
      tarifa: null,
      valorTotalManual: null,
      precoModeloSemana: 120,
    });

    expect(base).toBe(120);
  });

  it('usa o preço diário para rent-a-car quando não há valor manual', () => {
    const base = calcularBaseAluguerRenting({
      regime: 'rent_a_car',
      isLongaDuracao: false,
      dias: 3,
      tarifa: { preco_dia: 30, preco_semana: null, preco_mes: null },
      valorTotalManual: null,
      precoModeloSemana: null,
    });

    expect(base).toBe(90);
  });
});
