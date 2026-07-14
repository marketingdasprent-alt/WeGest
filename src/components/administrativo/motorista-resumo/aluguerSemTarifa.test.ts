import { describe, it, expect } from 'vitest';
import { deriveAluguerSemTarifa, type ViaturaPeriodoTarifa } from './aluguerSemTarifa';

const viaturaCom = (
  renting_tarifas: Array<{ preco_semana: number | null; ativa: boolean }> | null
): ViaturaPeriodoTarifa => ({
  viaturas: {
    renting_grupos: renting_tarifas ? { renting_tarifas } : null,
  },
});

describe('deriveAluguerSemTarifa', () => {
  it('devolve false quando não há viatura ativa (0€ legítimo)', () => {
    expect(deriveAluguerSemTarifa([])).toBe(false);
  });

  it('devolve false quando existe tarifa ativa com preço semanal > 0', () => {
    const viaturas = [viaturaCom([{ preco_semana: 120, ativa: true }])];
    expect(deriveAluguerSemTarifa(viaturas)).toBe(false);
  });

  it('devolve true quando a viatura não tem grupo (renting_grupos null)', () => {
    expect(deriveAluguerSemTarifa([viaturaCom(null)])).toBe(true);
  });

  it('devolve true quando a tarifa existe mas está inativa', () => {
    const viaturas = [viaturaCom([{ preco_semana: 120, ativa: false }])];
    expect(deriveAluguerSemTarifa(viaturas)).toBe(true);
  });

  it('devolve true quando a tarifa ativa tem preço semanal nulo ou 0', () => {
    const viaturas = [
      viaturaCom([
        { preco_semana: null, ativa: true },
        { preco_semana: 0, ativa: true },
      ]),
    ];
    expect(deriveAluguerSemTarifa(viaturas)).toBe(true);
  });

  it('devolve false se ao menos uma viatura tiver tarifa ativa válida', () => {
    const viaturas = [viaturaCom(null), viaturaCom([{ preco_semana: 90, ativa: true }])];
    expect(deriveAluguerSemTarifa(viaturas)).toBe(false);
  });
});
