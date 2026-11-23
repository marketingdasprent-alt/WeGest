import { describe, it, expect } from 'vitest';
import { baseFaturaContrato, motivoBaseFaturaIndisponivel } from './faturaContrato';

const base = { tarifaDiaria: 60, dias: 15 };
const tarifa275 = { valor: 275, origem: 'tarifa' as const };
const semPreco = { valor: null, origem: 'sem-preco' as const };

describe('baseFaturaContrato — TVDE', () => {
  it('sem manual factura o preço semanal, não tarifa × dias', () => {
    expect(
      baseFaturaContrato({
        ...base,
        regime: 'tvde',
        valorTotalManual: null,
        precoSemanalTvde: tarifa275,
      })
    ).toEqual({ estado: 'ok', valor: 275, origem: 'semanal-tvde' });
  });

  it('manual preenchido (1400 €/mês) nunca é substituído', () => {
    expect(
      baseFaturaContrato({
        ...base,
        regime: 'tvde',
        valorTotalManual: 1400,
        precoSemanalTvde: tarifa275,
      })
    ).toEqual({ estado: 'ok', valor: 1400, origem: 'manual' });
  });

  it('manual em texto "1400.00" é número, não concatenação', () => {
    expect(baseFaturaContrato({ ...base, regime: 'tvde', valorTotalManual: '1400.00' })).toEqual({
      estado: 'ok',
      valor: 1400,
      origem: 'manual',
    });
  });

  it('regime " TVDE " conta como TVDE', () => {
    expect(
      baseFaturaContrato({
        ...base,
        regime: ' TVDE ',
        valorTotalManual: null,
        precoSemanalTvde: tarifa275,
      }).estado
    ).toBe('ok');
    expect(baseFaturaContrato({ ...base, regime: ' TVDE ', valorTotalManual: null }).estado).toBe(
      'a-carregar'
    );
  });

  it('enquanto carrega ou sem resultado: a-carregar, nunca 0', () => {
    expect(
      baseFaturaContrato({ ...base, regime: 'tvde', valorTotalManual: null, carregando: true })
    ).toEqual({ estado: 'a-carregar' });
    expect(baseFaturaContrato({ ...base, regime: 'tvde', valorTotalManual: null })).toEqual({
      estado: 'a-carregar',
    });
  });

  it('erro a ler o preço bloqueia', () => {
    expect(
      baseFaturaContrato({ ...base, regime: 'tvde', valorTotalManual: null, erro: true })
    ).toEqual({ estado: 'erro' });
  });

  it('sem preço (tarifa null, tarifa_diaria 60, 15 dias) não cai para 900 €', () => {
    expect(
      baseFaturaContrato({
        ...base,
        regime: 'tvde',
        valorTotalManual: null,
        precoSemanalTvde: semPreco,
      })
    ).toEqual({ estado: 'sem-preco' });
  });

  it('manual 0 não conta como manual: segue o semanal', () => {
    expect(
      baseFaturaContrato({
        ...base,
        regime: 'tvde',
        valorTotalManual: 0,
        precoSemanalTvde: tarifa275,
      })
    ).toMatchObject({ estado: 'ok', valor: 275 });
  });
});

describe('baseFaturaContrato — rent-a-car e slot não mudam', () => {
  it('sem manual: tarifa × dias, mesmo com preço semanal à mão', () => {
    expect(
      baseFaturaContrato({
        ...base,
        regime: 'rent_a_car',
        valorTotalManual: null,
        precoSemanalTvde: tarifa275,
      })
    ).toEqual({ estado: 'ok', valor: 900, origem: 'tarifa-diaria' });
  });

  it('manual > 0 usa o manual; manual 0 segue a tarifa; texto numérico funciona', () => {
    expect(
      baseFaturaContrato({ ...base, regime: 'rent_a_car', valorTotalManual: 1275 })
    ).toMatchObject({ valor: 1275 });
    expect(
      baseFaturaContrato({ ...base, regime: 'rent_a_car', valorTotalManual: 0 })
    ).toMatchObject({ valor: 900 });
    expect(
      baseFaturaContrato({
        regime: 'rent_a_car',
        valorTotalManual: null,
        tarifaDiaria: '60.00',
        dias: 2,
      })
    ).toMatchObject({ valor: 120 });
  });

  it('slot ignora o preço semanal; sem tarifa nem dias dá 0', () => {
    expect(
      baseFaturaContrato({
        ...base,
        regime: 'slot',
        valorTotalManual: null,
        precoSemanalTvde: tarifa275,
      })
    ).toMatchObject({ origem: 'tarifa-diaria' });
    expect(
      baseFaturaContrato({
        regime: 'rent_a_car',
        valorTotalManual: null,
        tarifaDiaria: null,
        dias: 0,
      })
    ).toMatchObject({ valor: 0 });
  });
});

describe('motivoBaseFaturaIndisponivel', () => {
  it('só há motivo quando a base não está pronta', () => {
    expect(motivoBaseFaturaIndisponivel({ estado: 'ok', valor: 1, origem: 'manual' })).toBeNull();
    expect(motivoBaseFaturaIndisponivel({ estado: 'a-carregar' })).toMatch(/carregar/);
    expect(motivoBaseFaturaIndisponivel({ estado: 'erro' })).toMatch(/Não foi possível/);
    expect(motivoBaseFaturaIndisponivel({ estado: 'sem-preco' })).toMatch(/Sem preço/);
  });
});
