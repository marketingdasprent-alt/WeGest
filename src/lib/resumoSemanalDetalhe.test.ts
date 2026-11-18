import { describe, it, expect } from 'vitest';
import {
  construirDetalheResumo,
  ehColunaDetalheEmFalta,
  lerDetalheResumo,
  type EntradaDetalheResumo,
} from './resumoSemanalDetalhe';

const despesasZero = {
  aluguer: 0,
  combustivel: 0,
  portagens: 0,
  outros_custos: 0,
  slot: 0,
  caucao: 0,
  seguros: 0,
  reparacoes: 0,
};

const base: EntradaDetalheResumo = {
  faturadoBolt: 52.68,
  faturadoUber: 360.7,
  outrasReceitas: 0,
  receitaAjustada: 390.92,
  despesas: despesasZero,
  retencao: null,
  liquido: 390.92,
};

describe('construirDetalheResumo', () => {
  it('guarda receitas, despesas e líquido quando as contas batem', () => {
    const d = construirDetalheResumo(base);
    expect(d).toEqual({
      versao: 1,
      receitas: { bolt: 52.68, uber: 360.7, outras: 0 },
      totalReceitas: 390.92,
      despesas: despesasZero,
      totalDespesas: 0,
      retencao: null,
      liquido: 390.92,
    });
  });

  it('soma as despesas e confere com o líquido', () => {
    const d = construirDetalheResumo({
      ...base,
      despesas: { ...despesasZero, aluguer: 150, combustivel: 40.5, slot: 25 },
      liquido: 390.92 - 215.5,
    });
    expect(d?.totalDespesas).toBe(215.5);
    expect(d?.liquido).toBe(175.42);
  });

  it('não guarda o detalhe se as contas não batem com o líquido gravado', () => {
    expect(construirDetalheResumo({ ...base, liquido: 369.42 })).toBeNull();
  });

  it('com Retenção, o líquido é o total a receber da retenção', () => {
    const retencao = {
      totalLiquido: 300,
      taxaIva: 0.23,
      iva: 69,
      totalDocumento: 369,
      taxaIrs: 0.23,
      irs: 69,
      totalAReceber: 300,
    };
    const d = construirDetalheResumo({
      ...base,
      receitaAjustada: 400,
      despesas: { ...despesasZero, aluguer: 100 },
      retencao,
      liquido: 300,
    });
    expect(d?.retencao?.irs).toBe(69);
    expect(d?.liquido).toBe(300);
  });

  it('aceita líquido negativo (motorista em dívida)', () => {
    const d = construirDetalheResumo({
      ...base,
      receitaAjustada: 100,
      despesas: { ...despesasZero, aluguer: 250 },
      liquido: -150,
    });
    expect(d?.liquido).toBe(-150);
  });
});

describe('lerDetalheResumo', () => {
  it('lê o que foi gravado e rejeita lixo', () => {
    const d = construirDetalheResumo(base);
    expect(lerDetalheResumo(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(lerDetalheResumo(null)).toBeNull();
    expect(lerDetalheResumo({ versao: 2 })).toBeNull();
    expect(lerDetalheResumo('texto')).toBeNull();
  });
});

describe('ehColunaDetalheEmFalta', () => {
  it('reconhece a base sem a coluna nova', () => {
    expect(
      ehColunaDetalheEmFalta({ code: '42703', message: 'column "detalhe" does not exist' })
    ).toBe(true);
    expect(
      ehColunaDetalheEmFalta({
        code: 'PGRST204',
        message: "Could not find the 'detalhe' column of 'motorista_liquido_semanal'",
      })
    ).toBe(true);
  });
  it('não confunde com outros erros', () => {
    expect(ehColunaDetalheEmFalta({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(ehColunaDetalheEmFalta({ code: '42703', message: 'column "x" does not exist' })).toBe(
      false
    );
    expect(ehColunaDetalheEmFalta(null)).toBe(false);
  });
});
