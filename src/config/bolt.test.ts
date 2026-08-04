// src/config/bolt.test.ts
import { describe, it, expect } from 'vitest';
import { BOLT_FONTE_FINANCEIRA, receitaBoltDeduplicada, csvBoltEntraNoResumo } from './bolt';

describe('BOLT_FONTE_FINANCEIRA', () => {
  it("está em 'csv' — a API Bolt ainda é modo sombra", () => {
    // Se este teste falhar é porque alguém ligou a API como fonte do dinheiro.
    // Só se muda depois de conferir os totais das duas origens no mesmo período.
    expect(BOLT_FONTE_FINANCEIRA).toBe('csv');
  });
});

describe('receitaBoltDeduplicada', () => {
  it("com fonte 'csv' devolve só o CSV — nunca a soma das duas origens", () => {
    // O bug: 300 (CSV) + 500 (API) = 800 no recibo do motorista.
    expect(receitaBoltDeduplicada(500, 300, 'csv')).toBe(300);
  });

  it("com fonte 'csv' ignora a API mesmo quando ela é a única com dados", () => {
    expect(receitaBoltDeduplicada(500, 0, 'csv')).toBe(0);
  });

  it("com fonte 'api' manda a API e o CSV não se soma", () => {
    expect(receitaBoltDeduplicada(500, 300, 'api')).toBe(500);
  });

  it("com fonte 'api' cai no CSV quando a API não tem viagens no período", () => {
    expect(receitaBoltDeduplicada(0, 300, 'api')).toBe(300);
  });

  it('usa a fonte configurada por omissão', () => {
    expect(receitaBoltDeduplicada(500, 300)).toBe(BOLT_FONTE_FINANCEIRA === 'api' ? 500 : 300);
  });
});

describe('csvBoltEntraNoResumo', () => {
  it("com fonte 'csv' o CSV entra sempre, mesmo havendo dados da API", () => {
    expect(csvBoltEntraNoResumo(true, 'csv')).toBe(true);
    expect(csvBoltEntraNoResumo(false, 'csv')).toBe(true);
  });

  it("com fonte 'api' o CSV é descartado só quando a API já trouxe viagens", () => {
    expect(csvBoltEntraNoResumo(true, 'api')).toBe(false);
    expect(csvBoltEntraNoResumo(false, 'api')).toBe(true);
  });
});
