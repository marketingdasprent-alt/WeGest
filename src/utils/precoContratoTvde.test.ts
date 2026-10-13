import { describe, expect, it } from 'vitest';
import { motivoTvdeSemPreco } from './precoContratoTvde';

const base = {
  regime: 'tvde',
  valorTotalManual: null,
  tarifaId: 'tvde-base',
  modeloId: 'bmw-530e',
  precoSemanaModelo: 475,
};

describe('contrato TVDE tem de ter preço', () => {
  it('tarifa com preço para o modelo: passa', () => {
    expect(motivoTvdeSemPreco(base)).toBeNull();
  });

  // Os importados de 08/07 (#468, #570...) ficaram sem tarifa e a 0 € no fecho.
  it('sem tarifa nem valor acordado: recusa', () => {
    expect(motivoTvdeSemPreco({ ...base, tarifaId: null })).toMatch(/não tem tarifa/);
  });

  // AG-69-PL e AD-62-TM não têm modelo: nenhuma tarifa tem preço para elas.
  it('viatura sem modelo: recusa', () => {
    expect(motivoTvdeSemPreco({ ...base, modeloId: null })).toMatch(/não tem modelo/);
  });

  // #794: TVDE - Base não tem preço para o Mercedes EQB.
  it('modelo sem preço na tarifa: recusa', () => {
    expect(motivoTvdeSemPreco({ ...base, precoSemanaModelo: null })).toMatch(/não tem preço/);
  });

  it('valor acordado manda, mesmo sem tarifa (0 incluído)', () => {
    expect(motivoTvdeSemPreco({ ...base, tarifaId: null, valorTotalManual: 300 })).toBeNull();
    expect(motivoTvdeSemPreco({ ...base, tarifaId: null, valorTotalManual: 0 })).toBeNull();
  });

  it('rent-a-car e slot não entram nesta regra', () => {
    expect(motivoTvdeSemPreco({ ...base, regime: 'rent_a_car', tarifaId: null })).toBeNull();
    expect(motivoTvdeSemPreco({ ...base, regime: 'slot', tarifaId: null })).toBeNull();
  });
});
