import { describe, it, expect } from 'vitest';

import { precisaCombustivel, precisaEletrico, precisaGpl } from './combustivel';

describe('precisaCombustivel', () => {
  it('true para combustão e desconhecido', () => {
    for (const t of [
      'gasolina',
      'diesel',
      'hibrido',
      'gasolina_gpl',
      'diesel_gpl',
      '',
      null,
      undefined,
    ]) {
      expect(precisaCombustivel(t)).toBe(true);
    }
  });
  it('false para elétrico puro e GPL puro', () => {
    expect(precisaCombustivel('eletrico')).toBe(false);
    expect(precisaCombustivel('gpl')).toBe(false);
  });
});

describe('precisaEletrico', () => {
  it('true para elétrico e híbrido', () => {
    expect(precisaEletrico('eletrico')).toBe(true);
    expect(precisaEletrico('hibrido')).toBe(true);
  });
  it('false para os restantes', () => {
    expect(precisaEletrico('gasolina')).toBe(false);
    expect(precisaEletrico(null)).toBe(false);
  });
});

describe('precisaGpl', () => {
  it('true para gpl e bi-fuel', () => {
    expect(precisaGpl('gpl')).toBe(true);
    expect(precisaGpl('gasolina_gpl')).toBe(true);
    expect(precisaGpl('diesel_gpl')).toBe(true);
  });
  it('false para os restantes', () => {
    expect(precisaGpl('eletrico')).toBe(false);
    expect(precisaGpl('')).toBe(false);
  });
});

// O catálogo viatura_combustiveis guarda nomes de exibição (ex.: "Elétrico",
// "Híbrido"). O matching tem de ignorar acentos e maiúsculas.
describe('insensível a acentos e maiúsculas (nomes do catálogo)', () => {
  it('Elétrico → bateria, não combustível', () => {
    expect(precisaEletrico('Elétrico')).toBe(true);
    expect(precisaCombustivel('Elétrico')).toBe(false);
  });
  it('Híbrido → combustível e bateria', () => {
    expect(precisaEletrico('Híbrido')).toBe(true);
    expect(precisaCombustivel('Híbrido')).toBe(true);
  });
  it('Gasolina / Diesel → combustível', () => {
    expect(precisaCombustivel('Gasolina')).toBe(true);
    expect(precisaCombustivel('Diesel')).toBe(true);
  });
});

// Valores REAIS do catálogo viatura_combustiveis (nomes descritivos) — exigem
// matching por substring, não por igualdade exata.
describe('valores reais do catálogo', () => {
  it('Elétrico → só bateria', () => {
    expect(precisaEletrico('Elétrico')).toBe(true);
    expect(precisaCombustivel('Elétrico')).toBe(false);
    expect(precisaGpl('Elétrico')).toBe(false);
  });
  it('Híbrido Plug-in → combustível + bateria', () => {
    expect(precisaCombustivel('Híbrido Plug-in')).toBe(true);
    expect(precisaEletrico('Híbrido Plug-in')).toBe(true);
  });
  it('Híbrido/Diesel e Híbrido/Gasolina → combustível + bateria', () => {
    expect(precisaCombustivel('Híbrido/Diesel')).toBe(true);
    expect(precisaEletrico('Híbrido/Diesel')).toBe(true);
    expect(precisaCombustivel('Híbrido/Gasolina')).toBe(true);
    expect(precisaEletrico('Híbrido/Gasolina')).toBe(true);
  });
  it('Bi-Fuel - Gasolina/GPL → combustível + GPL', () => {
    expect(precisaCombustivel('Bi-Fuel - Gasolina/GPL')).toBe(true);
    expect(precisaGpl('Bi-Fuel - Gasolina/GPL')).toBe(true);
  });
});
