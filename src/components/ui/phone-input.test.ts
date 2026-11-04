import { describe, expect, it } from 'vitest';
import { formatPhoneNumber, lerNumeroDigitado, validatePhoneNumber } from './phone-input';

const guardado = (input: string, pais = 'PT') => {
  const lido = lerNumeroDigitado(input, pais);
  return formatPhoneNumber(lido.countryCode, lido.number);
};

describe('lerNumeroDigitado', () => {
  it('escrito à mão fica como estava', () => {
    expect(guardado('912 345 678')).toBe('+351 912345678');
    expect(guardado('9123456789')).toBe('+351 912345678');
  });

  it('preenchimento automático com +351 não perde os últimos dígitos (lead "+351 351…")', () => {
    expect(guardado('+351 962 145 678')).toBe('+351 962145678');
    expect(guardado('+351962145678')).toBe('+351 962145678');
    expect(validatePhoneNumber(guardado('+351962145678'))).toBe(true);
  });

  it('aceita 00351 e 351 sem o mais', () => {
    expect(guardado('00351 962 145 678')).toBe('+351 962145678');
    expect(guardado('351962145678')).toBe('+351 962145678');
  });

  it('indicativo de outro país muda o país', () => {
    expect(lerNumeroDigitado('+55 11 91234 5678', 'PT')).toEqual({
      countryCode: 'BR',
      number: '11912345678',
    });
    expect(guardado('+44 7911 123456')).toBe('+44 7911123456');
  });

  it('só o mais apaga o número', () => {
    expect(guardado('+')).toBe('');
    expect(guardado('')).toBe('');
  });
});
