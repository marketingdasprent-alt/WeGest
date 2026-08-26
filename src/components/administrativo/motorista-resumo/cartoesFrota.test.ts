import { describe, it, expect } from 'vitest';
import { formatCartoesFrota } from './cartoesFrota';

describe('formatCartoesFrota', () => {
  it('mostra o cartão com a etiqueta do tipo, como na ficha', () => {
    expect(formatCartoesFrota([{ numero: '2160', tipo: 'repsol' }])).toBe('Repsol 2160');
  });

  it('sem cartões ligados devolve N/A', () => {
    expect(formatCartoesFrota([])).toBe('N/A');
    expect(formatCartoesFrota(null)).toBe('N/A');
    expect(formatCartoesFrota(undefined)).toBe('N/A');
  });

  it('ordena por tipo e depois por número, como a ficha', () => {
    expect(
      formatCartoesFrota([
        { numero: '2160', tipo: 'repsol' },
        { numero: '0034', tipo: 'repsol' },
        { numero: '526', tipo: 'bp' },
        { numero: '28940', tipo: 'edp' },
      ])
    ).toBe('BP 526 / EDP 28940 / Repsol 0034 / Repsol 2160');
  });

  it('ignora linhas sem número', () => {
    expect(
      formatCartoesFrota([
        { numero: null, tipo: 'bp' },
        { numero: '2160', tipo: 'repsol' },
      ])
    ).toBe('Repsol 2160');
  });

  it('um tipo desconhecido não desaparece do resumo', () => {
    expect(formatCartoesFrota([{ numero: '99', tipo: 'galp' }])).toBe('GALP 99');
    expect(formatCartoesFrota([{ numero: '99', tipo: null }])).toBe('99');
  });

  // O caso que originou isto: o Aymen Mhamdi tinha cartao_bp="BP DA 1136" e
  // cartao_frota="1136" na ficha (colunas de texto legado), e o resumo
  // imprimia "BP DA 1136 / 2160 / 1136" — dois deles do mesmo cartão BP, que
  // estava bloqueado e sem motorista. Ligado a sério só tinha o Repsol 2160.
  it('não inventa cartões que não estão ligados ao motorista', () => {
    expect(formatCartoesFrota([{ numero: '2160', tipo: 'repsol' }])).toBe('Repsol 2160');
  });
});
