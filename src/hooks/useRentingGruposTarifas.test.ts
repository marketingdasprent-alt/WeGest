import { describe, expect, it } from 'vitest';
import {
  calcularBaseAluguerRenting,
  calcularFaturacaoRenting,
  resolverValorTotalManualAoMudarTarifa,
} from './useRentingGruposTarifas';

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

  it('valorTotalManual tem prioridade sobre qualquer tarifa/regime', () => {
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

  // Um aluguer a zero (oferecido/incluído) é uma decisão legítima e tem de
  // sobreviver ao gravar — antes o 0 caía no cálculo automático e o preço da
  // tarifa reaparecia sozinho.
  it('valorTotalManual = 0 é um override válido — não cai no cálculo da tarifa', () => {
    const base = calcularBaseAluguerRenting({
      regime: 'tvde',
      isLongaDuracao: false,
      dias: 7,
      tarifa: null,
      valorTotalManual: 0,
      precoModeloSemana: 120,
    });

    expect(base).toBe(0);
  });

  it('sem override (null) segue a tarifa', () => {
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
    const fat = calcularFaturacaoRenting('rent_a_car', false, 3, {
      preco_dia: 33.333,
      preco_semana: null,
      preco_mes: null,
    });

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

// ─────────────────────────────────────────────────────────────────────────
// resolverValorTotalManualAoMudarTarifa — mudar a tarifa no formulário do
// contrato tinha de recalcular o preço, e não recalculava: valor_total_manual
// manda sobre calcularBaseAluguerRenting e sobre o preview deste cartão
// (que mostra valor_total_manual ?? faturacao.valor), por isso trocar a
// tarifa com um manual já gravado não mudava NADA — nem o número guardado,
// nem o que aparecia no ecrã. Em 206 dos 236 contratos vivos há um
// valor_total_manual gravado.
// ─────────────────────────────────────────────────────────────────────────
describe('resolverValorTotalManualAoMudarTarifa', () => {
  it('TVDE: o novo preço semanal do modelo passa a ser o valor a gravar', () => {
    const novo = resolverValorTotalManualAoMudarTarifa(
      'tvde',
      false,
      7,
      { preco_dia: null, preco_semana: 300, preco_mes: null },
      300, // precoModeloSemana da tarifa nova
      null,
      null
    );
    expect(novo).toBe(300);
  });

  // O caso concreto encontrado na auditoria: contrato #375 (BP-25-AD) tinha
  // valor_total_manual = 300 gravado; a tarifa no ecrã foi trocada para uma
  // de 275/semana. Sem esta correção o contrato continuava a cobrar 300.
  it('reescreve um valor_total_manual antigo pelo preço da tarifa nova, mesmo que existisse um manual', () => {
    const novo = resolverValorTotalManualAoMudarTarifa(
      'tvde',
      false,
      7,
      { preco_dia: null, preco_semana: 275, preco_mes: null },
      275,
      null,
      null
    );
    expect(novo).toBe(275);
  });

  it('rent-a-car diário: recalcula dias × preço/dia da tarifa nova', () => {
    const novo = resolverValorTotalManualAoMudarTarifa(
      'rent_a_car',
      false,
      5,
      { preco_dia: 40, preco_semana: null, preco_mes: null },
      null,
      40,
      null
    );
    expect(novo).toBe(200);
  });

  it('rent-a-car longa duração: usa o preço/mês da tarifa nova', () => {
    const novo = resolverValorTotalManualAoMudarTarifa(
      'rent_a_car',
      true,
      30,
      { preco_dia: null, preco_semana: null, preco_mes: 650 },
      null,
      null,
      650
    );
    expect(novo).toBe(650);
  });

  it('regime slot: nunca toca no valor — o slot não é calculado por tarifa', () => {
    const novo = resolverValorTotalManualAoMudarTarifa(
      'slot',
      false,
      7,
      { preco_dia: null, preco_semana: 300, preco_mes: null },
      300,
      null,
      null
    );
    expect(novo).toBeNull();
  });

  it('tarifa limpa (null): não inventa um preço, o manual existente fica como está', () => {
    const novo = resolverValorTotalManualAoMudarTarifa('tvde', false, 7, null, null, null, null);
    expect(novo).toBeNull();
  });

  // O modelo da viatura não tem preço definido nesta tarifa nova — é o caso
  // que o alerta "Modelo sem preço nesta tarifa" assinala no ecrã. Não se
  // inventa um valor; o utilizador tem de escolher outra tarifa ou definir o
  // preço do modelo primeiro.
  it('tarifa sem preço para o modelo: não sobrescreve o valor existente', () => {
    const novo = resolverValorTotalManualAoMudarTarifa(
      'tvde',
      false,
      7,
      { preco_dia: null, preco_semana: null, preco_mes: null },
      null,
      null,
      null
    );
    expect(novo).toBeNull();
  });
});
