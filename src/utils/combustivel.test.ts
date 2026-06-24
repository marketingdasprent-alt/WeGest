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
