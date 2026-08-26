import { describe, it, expect } from 'vitest';
import { buildTvdeModeloPrecoMap, buildPrecoPorTarifaModelo } from './tvdeModeloPreco';

const linha = (tarifa_id: string, modelo_id: string, preco_semana: number | string | null) => ({
  tarifa_id,
  modelo_id,
  preco_semana,
});

describe('buildTvdeModeloPrecoMap', () => {
  it('um modelo com uma só tarifa devolve esse preço', () => {
    const m = buildTvdeModeloPrecoMap([linha('t1', 'modelo-a', 230)]);
    expect(m.get('modelo-a')).toBe(230);
  });

  it('não depende da ordem em que a base de dados devolve as linhas', () => {
    const a = linha('t1', 'modelo-a', 250);
    const b = linha('t2', 'modelo-a', 210);
    expect(buildTvdeModeloPrecoMap([a, b])).toEqual(buildTvdeModeloPrecoMap([b, a]));
  });

  it('entre tarifas activas para o mesmo modelo, fica o preço mais baixo', () => {
    const m = buildTvdeModeloPrecoMap([
      linha('t1', 'modelo-a', 250),
      linha('t2', 'modelo-a', 210),
      linha('t3', 'modelo-a', 275),
    ]);
    expect(m.get('modelo-a')).toBe(210);
  });

  it('empate no preço desempata pelo tarifa_id, para ser reproduzível', () => {
    const m1 = buildTvdeModeloPrecoMap([
      linha('zzz', 'modelo-a', 200),
      linha('aaa', 'modelo-a', 200),
    ]);
    const m2 = buildTvdeModeloPrecoMap([
      linha('aaa', 'modelo-a', 200),
      linha('zzz', 'modelo-a', 200),
    ]);
    expect(m1.get('modelo-a')).toBe(200);
    expect(m1).toEqual(m2);
  });

  it('modelos diferentes não interferem', () => {
    const m = buildTvdeModeloPrecoMap([linha('t1', 'a', 100), linha('t1', 'b', 300)]);
    expect(m.get('a')).toBe(100);
    expect(m.get('b')).toBe(300);
  });

  it('ignora linhas sem modelo, sem preço, ou com preço não numérico', () => {
    const m = buildTvdeModeloPrecoMap([
      { tarifa_id: 't1', modelo_id: null, preco_semana: 100 },
      linha('t2', 'modelo-a', null),
      linha('t3', 'modelo-b', 'nao-e-numero'),
    ]);
    expect(m.size).toBe(0);
  });

  it('aceita preço em texto, como vem do PostgREST', () => {
    const m = buildTvdeModeloPrecoMap([linha('t1', 'modelo-a', '224.99')]);
    expect(m.get('modelo-a')).toBeCloseTo(224.99, 6);
  });

  it('preço zero é um preço, não uma ausência', () => {
    const m = buildTvdeModeloPrecoMap([linha('t1', 'modelo-a', 0), linha('t2', 'modelo-a', 210)]);
    expect(m.get('modelo-a')).toBe(0);
  });
});

describe('buildPrecoPorTarifaModelo', () => {
  it('chaveia por tarifa e modelo — é assim que o contrato resolve o preço', () => {
    const m = buildPrecoPorTarifaModelo([
      linha('t1', 'modelo-a', 250),
      linha('t2', 'modelo-a', 210),
    ]);
    expect(m.get('t1|modelo-a')).toBe(250);
    expect(m.get('t2|modelo-a')).toBe(210);
  });

  it('exige tarifa e modelo', () => {
    const m = buildPrecoPorTarifaModelo([
      { tarifa_id: null, modelo_id: 'a', preco_semana: 1 },
      { tarifa_id: 't1', modelo_id: null, preco_semana: 1 },
    ]);
    expect(m.size).toBe(0);
  });
});
