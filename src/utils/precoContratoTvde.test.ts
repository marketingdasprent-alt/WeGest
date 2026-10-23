import { describe, expect, it } from 'vitest';
import {
  motivoTvdeSemPreco,
  precoSemanaNegociadoTvde,
  tarifaCobreModelo,
} from './precoContratoTvde';

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

describe('precoSemanaNegociadoTvde', () => {
  it('TVDE com preço negociado devolve-o', () => {
    expect(precoSemanaNegociadoTvde('tvde', 180)).toBe(180);
    expect(precoSemanaNegociadoTvde('tvde', '180.50')).toBe(180.5);
  });
  it('0 é um preço negociado, não "segue a tarifa"', () => {
    expect(precoSemanaNegociadoTvde('tvde', 0)).toBe(0);
  });
  it('sem preço negociado segue a tarifa', () => {
    expect(precoSemanaNegociadoTvde('tvde', null)).toBeNull();
    expect(precoSemanaNegociadoTvde('tvde', undefined)).toBeNull();
    expect(precoSemanaNegociadoTvde('tvde', '')).toBeNull();
  });
  it('fora de TVDE nunca se aplica', () => {
    expect(precoSemanaNegociadoTvde('rent_a_car', 180)).toBeNull();
    expect(precoSemanaNegociadoTvde(null, 180)).toBeNull();
  });
});

describe('tarifaCobreModelo', () => {
  it('TVDE precisa do preço semanal do modelo', () => {
    expect(tarifaCobreModelo('tvde', { preco_semana: 200 })).toBe(true);
    expect(tarifaCobreModelo('tvde', { preco_semana: 0 })).toBe(true);
    expect(tarifaCobreModelo('tvde', { preco_semana: null, preco_dia: 30 })).toBe(false);
  });

  it('Rent-a-Car precisa do preço diário', () => {
    expect(tarifaCobreModelo('rent_a_car', { preco_dia: 30 })).toBe(true);
    expect(tarifaCobreModelo('rent_a_car', { preco_semana: 200 })).toBe(false);
  });

  it('modelo sem linha na tarifa não está coberto', () => {
    expect(tarifaCobreModelo('tvde', undefined)).toBe(false);
  });
});
