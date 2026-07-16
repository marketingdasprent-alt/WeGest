import { describe, it, expect } from 'vitest';
import { normalizeEmail, normalizePhone } from './normalize';

describe('normalizeEmail', () => {
  it('faz trim e lowercase', () => {
    expect(normalizeEmail('  Joao.Silva@Example.COM ')).toBe('joao.silva@example.com');
  });

  it('devolve null para vazio/undefined/null', () => {
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('remove formatação e mantém só os últimos 9 dígitos', () => {
    expect(normalizePhone('+351 912 345 678')).toBe('912345678');
  });

  it('normaliza para o mesmo valor independentemente do prefixo internacional', () => {
    expect(normalizePhone('912 345 678')).toBe(normalizePhone('+351912345678'));
  });

  it('devolve null para vazio/undefined/null', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});
