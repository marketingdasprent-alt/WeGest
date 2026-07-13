import { describe, it, expect } from 'vitest';
import { deriveResumoFinanceiro, type ResumoFinanceiroInput } from './resumoFinanceiro';

const base: ResumoFinanceiroInput = {
  isImportado: false,
  reciboVerde: true,
  receitas: { bolt: 0, uber: 0, outras_receitas: 0 },
  gorjetaBolt: 0,
  gorjetaUber: 0,
  totalDespesas: 0,
  valoresSemanaAnterior: 0,
  liquidoImportado: 0,
};

describe('deriveResumoFinanceiro', () => {
  it('gorjeta já dentro do faturado — recibo verde mostra o total sem ÷1.06', () => {
    // Uber = 508,90 já inclui gorjeta de 13,75. Com recibo verde, mostra-se
    // o valor total sem ajuste — não somar gorjeta extra, não dividir.
    const r = deriveResumoFinanceiro({
      ...base,
      reciboVerde: true,
      receitas: { bolt: 0, uber: 508.9, outras_receitas: 0 },
      gorjetaUber: 13.75,
    });
    expect(r.gorjeta).toBeCloseTo(13.75, 2);
    expect(r.receitasExibidas.uber).toBeCloseTo(508.9, 2);
    expect(r.receitaAjustada).toBeCloseTo(508.9, 2);
    expect(r.liquido).toBeCloseTo(508.9, 2);
  });

  it('recibo verde: gorjeta dentro do faturado, sem ÷1.06, despesas subtraem', () => {
    // faturado_bolt=100 já inclui 5 de gorjeta, faturado_uber=200 já inclui 10.
    const r = deriveResumoFinanceiro({
      ...base,
      reciboVerde: true,
      receitas: { bolt: 100, uber: 200, outras_receitas: 50 },
      gorjetaBolt: 5,
      gorjetaUber: 10,
      totalDespesas: 30,
    });
    expect(r.totalReceitas).toBeCloseTo(350, 2);
    // gorjeta já dentro do faturado — exibimos o valor total da plataforma
    expect(r.receitasExibidas.bolt).toBeCloseTo(100, 2);
    expect(r.receitasExibidas.uber).toBeCloseTo(200, 2);
    expect(r.receitaAjustada).toBeCloseTo(350, 2);
    expect(r.liquido).toBeCloseTo(320, 2); // 350 - 30
  });

  it('sem recibo verde: extrai gorjeta do faturado, ÷1.06 na base, soma gorjeta volta', () => {
    // faturado_bolt=106 já inclui 5 de gorjeta → base real = 101
    // faturado_uber=212 já inclui 10 de gorjeta → base real = 202
    // (101/1.06 + 5) + (202/1.06 + 10) + 40 = 95.28 + 5 + 190.57 + 10 + 40
    const r = deriveResumoFinanceiro({
      ...base,
      reciboVerde: false,
      receitas: { bolt: 106, uber: 212, outras_receitas: 40 },
      gorjetaBolt: 5,
      gorjetaUber: 10,
      totalDespesas: 0,
    });
    // (106-5)/1.06 + 5 = 101/1.06 + 5 = 95.2830... + 5 = 100.2830...
    expect(r.receitasExibidas.bolt).toBeCloseTo(100.28, 2);
    // (212-10)/1.06 + 10 = 202/1.06 + 10 = 190.5660... + 10 = 200.5660...
    expect(r.receitasExibidas.uber).toBeCloseTo(200.57, 2);
    // 100.28 + 200.57 + 40 = 340.85
    expect(r.receitaAjustada).toBeCloseTo(340.85, 2);
    expect(r.liquido).toBeCloseTo(340.85, 2);
  });

  it('caso real JORGE: 732,14 faturado + 11,13 gorjeta, sem recibo verde', () => {
    // faturado_uber=732,14 já inclui gorjeta de 11,13
    // base real = 732,14 - 11,13 = 721,01
    // 721,01 / 1,06 = 680,20
    // 680,20 + 11,13 = 691,33
    const r = deriveResumoFinanceiro({
      ...base,
      reciboVerde: false,
      receitas: { bolt: 0, uber: 732.14, outras_receitas: 0 },
      gorjetaUber: 11.13,
    });
    expect(r.receitasExibidas.uber).toBeCloseTo(691.33, 2);
    expect(r.receitaAjustada).toBeCloseTo(691.33, 2);
    expect(r.liquido).toBeCloseTo(691.33, 2);
  });

  it('importado: usa o líquido do recibo e ignora gorjeta/ajuste', () => {
    const r = deriveResumoFinanceiro({
      ...base,
      isImportado: true,
      receitas: { bolt: 0, uber: 508.9, outras_receitas: 0 },
      gorjetaUber: 13.75,
      liquidoImportado: 400,
    });
    expect(r.receitaAjustada).toBeCloseTo(508.9, 2);
    expect(r.liquido).toBe(400);
    expect(r.totalAReceber).toBe(400);
  });

  it('valores da semana anterior somam ao total a receber', () => {
    const r = deriveResumoFinanceiro({
      ...base,
      reciboVerde: true,
      receitas: { bolt: 0, uber: 100, outras_receitas: 0 },
      valoresSemanaAnterior: 25,
    });
    expect(r.liquido).toBeCloseTo(125, 2);
  });
});
