import { describe, expect, it } from 'vitest';
import { calcularBaseAluguerRenting, calcularFaturacaoRenting } from './useRentingGruposTarifas';

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

  it('TVDE sem preço de modelo na tarifa devolve null (bloqueia, não recai no grupo)', () => {
    const base = calcularBaseAluguerRenting({
      regime: 'tvde',
      isLongaDuracao: false,
      dias: 7,
      tarifa: { preco_dia: null, preco_semana: 300, preco_mes: null },
      valorTotalManual: null,
      precoModeloSemana: null,
    });

    expect(base).toBeNull();
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

  it('preço/dia por modelo tem prioridade sobre o preço/dia do grupo', () => {
    const base = calcularBaseAluguerRenting({
      regime: 'rent_a_car',
      isLongaDuracao: false,
      dias: 3,
      tarifa: { preco_dia: 30, preco_semana: null, preco_mes: null },
      valorTotalManual: null,
      precoModeloDia: 25,
    });

    expect(base).toBe(75);
  });

  it('rent-a-car longa duração usa preço/mês por modelo, com fallback ao grupo', () => {
    const comModelo = calcularBaseAluguerRenting({
      regime: 'rent_a_car',
      isLongaDuracao: true,
      dias: 30,
      tarifa: { preco_dia: null, preco_semana: null, preco_mes: 500 },
      valorTotalManual: null,
      precoModeloMes: 450,
    });
    expect(comModelo).toBe(450);

    const semModelo = calcularBaseAluguerRenting({
      regime: 'rent_a_car',
      isLongaDuracao: true,
      dias: 30,
      tarifa: { preco_dia: null, preco_semana: null, preco_mes: 500 },
      valorTotalManual: null,
    });
    expect(semModelo).toBe(500);
  });

  it('valorTotalManual > 0 tem prioridade sobre qualquer tarifa/regime', () => {
    const base = calcularBaseAluguerRenting({
      regime: 'tvde',
      isLongaDuracao: false,
      dias: 7,
      tarifa: null,
      valorTotalManual: 999,
      precoModeloSemana: 120,
    });

    expect(base).toBe(999);
  });

  it('valorTotalManual = 0 NÃO conta como override — cai no cálculo normal', () => {
    const base = calcularBaseAluguerRenting({
      regime: 'tvde',
      isLongaDuracao: false,
      dias: 7,
      tarifa: null,
      valorTotalManual: 0,
      precoModeloSemana: 120,
    });

    expect(base).toBe(120);
  });

  it('rent-a-car sem dias, sem preço, ou dias<=0 devolve null', () => {
    const semTarifaNemModelo = calcularBaseAluguerRenting({
      regime: 'rent_a_car',
      isLongaDuracao: false,
      dias: 3,
      tarifa: null,
      valorTotalManual: null,
    });
    expect(semTarifaNemModelo).toBeNull();

    const semDias = calcularBaseAluguerRenting({
      regime: 'rent_a_car',
      isLongaDuracao: false,
      dias: null,
      tarifa: { preco_dia: 30, preco_semana: null, preco_mes: null },
      valorTotalManual: null,
    });
    expect(semDias).toBeNull();

    const diasZero = calcularBaseAluguerRenting({
      regime: 'rent_a_car',
      isLongaDuracao: false,
      dias: 0,
      tarifa: { preco_dia: 30, preco_semana: null, preco_mes: null },
      valorTotalManual: null,
    });
    expect(diasZero).toBeNull();
  });
});

describe('calcularFaturacaoRenting', () => {
  it('TVDE: valor semanal do modelo, arredondado a 2 casas, semanalCondutor preenchido', () => {
    const fat = calcularFaturacaoRenting('tvde', false, null, null, 119.999);

    expect(fat).toEqual({
      valor: 120,
      modo: 'Semanal',
      descricao: 'Preço semanal do modelo · renova a cada semana',
      semanalCondutor: 119.999,
    });
  });

  it('TVDE sem preço de modelo bloqueia (devolve null, mesmo com tarifa de grupo)', () => {
    const fat = calcularFaturacaoRenting(
      'tvde',
      false,
      null,
      { preco_dia: null, preco_semana: 300, preco_mes: null },
      null
    );

    expect(fat).toBeNull();
  });

  it('rent-a-car longa duração: preço/mês do modelo, com fallback ao grupo quando ausente', () => {
    const comModelo = calcularFaturacaoRenting(
      'rent_a_car',
      true,
      null,
      { preco_dia: null, preco_semana: null, preco_mes: 500 },
      null,
      null,
      450
    );
    expect(comModelo).toEqual({
      valor: 450,
      modo: 'Mensal',
      descricao: '30 dias · renova a cada mês',
      semanalCondutor: null,
    });

    const semModelo = calcularFaturacaoRenting('rent_a_car', true, null, {
      preco_dia: null,
      preco_semana: null,
      preco_mes: 500,
    });
    expect(semModelo?.valor).toBe(500);

    const semNenhum = calcularFaturacaoRenting('rent_a_car', true, null, {
      preco_dia: null,
      preco_semana: null,
      preco_mes: null,
    });
    expect(semNenhum).toBeNull();
  });

  it('rent-a-car diário: valor = dias × preço, arredondado a 2 casas, com descrição', () => {
    const fat = calcularFaturacaoRenting(
      'rent_a_car',
      false,
      3,
      { preco_dia: 33.333, preco_semana: null, preco_mes: null }
    );

    expect(fat).toEqual({
      valor: 100,
      modo: 'Diário',
      descricao: '3 dia(s) × 33.333 €',
      semanalCondutor: null,
    });
  });

  it('rent-a-car diário sem dias válidos ou sem preço devolve null', () => {
    const semDias = calcularFaturacaoRenting('rent_a_car', false, null, {
      preco_dia: 30,
      preco_semana: null,
      preco_mes: null,
    });
    expect(semDias).toBeNull();

    const semPreco = calcularFaturacaoRenting('rent_a_car', false, 3, {
      preco_dia: null,
      preco_semana: null,
      preco_mes: null,
    });
    expect(semPreco).toBeNull();
  });
});
