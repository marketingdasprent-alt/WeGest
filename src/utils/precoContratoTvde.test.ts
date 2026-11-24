import { describe, expect, it } from 'vitest';
import {
  motivoTvdeSemPreco,
  precoSemanaDifereDaTarifa,
  precoSemanaNegociadoTvde,
  tarifaCobreModelo,
} from './precoContratoTvde';

const base = {
  regime: 'tvde',
  precoSemanaAcordado: null,
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

  it('preço negociado e aprovado vale, mesmo sem tarifa (0 incluído)', () => {
    expect(motivoTvdeSemPreco({ ...base, tarifaId: null, precoSemanaAcordado: 300 })).toBeNull();
    expect(motivoTvdeSemPreco({ ...base, tarifaId: null, precoSemanaAcordado: 0 })).toBeNull();
  });

  // O valor manual não é cobrado no TVDE (caso #1026): já não conta como preço.
  it('um valor manual sozinho já não chega', () => {
    const comManual = { ...base, tarifaId: null, valorTotalManual: 300 };
    expect(motivoTvdeSemPreco(comManual)).toMatch(/não tem tarifa/);
  });

  // A tarifa só com preço geral (225) é cobrada pelo fecho: não é "sem preço".
  it('preço geral da tarifa conta, mesmo sem linha para o modelo', () => {
    const geral = { ...base, precoSemanaModelo: null, precoTarifa: 225 };
    expect(motivoTvdeSemPreco(geral)).toBeNull();
    expect(motivoTvdeSemPreco({ ...geral, modeloId: null })).toBeNull();
  });

  it('valor manual legado só vale quando passado (renovação)', () => {
    const semPreco = { ...base, precoSemanaModelo: null };
    expect(motivoTvdeSemPreco({ ...semPreco, valorManualLegado: 300 })).toBeNull();
    expect(motivoTvdeSemPreco(semPreco)).toMatch(/não tem preço/);
  });

  it('usa o mesmo conceito de TVDE do fecho (espaços e maiúsculas)', () => {
    expect(motivoTvdeSemPreco({ ...base, regime: ' TVDE ', tarifaId: null })).toMatch(
      /não tem tarifa/
    );
  });

  it('as mensagens já não mandam indicar um valor acordado à mão', () => {
    const msgs = [
      motivoTvdeSemPreco({ ...base, tarifaId: null }),
      motivoTvdeSemPreco({ ...base, modeloId: null }),
      motivoTvdeSemPreco({ ...base, precoSemanaModelo: null }),
    ];
    msgs.forEach((m) => expect(m).not.toMatch(/indica o valor acordado/));
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

describe('precoSemanaDifereDaTarifa', () => {
  it('compara em cêntimos', () => {
    expect(precoSemanaDifereDaTarifa(180, 200)).toBe(true);
    expect(precoSemanaDifereDaTarifa(200, 200)).toBe(false);
    expect(precoSemanaDifereDaTarifa(0.1 + 0.2, 0.3)).toBe(false);
    expect(precoSemanaDifereDaTarifa(200.01, 200)).toBe(true);
  });
  it('sem valor pretendido ou sem preço de tarifa não há diferença', () => {
    expect(precoSemanaDifereDaTarifa(null, 200)).toBe(false);
    expect(precoSemanaDifereDaTarifa(undefined, 200)).toBe(false);
    expect(precoSemanaDifereDaTarifa(180, null)).toBe(false);
  });
});
