import { describe, expect, it } from 'vitest';
import { motoristasComCustos } from './motoristasComCustos';

describe('motoristasComCustos', () => {
  it('inclui motorista que na semana só tem o aluguer da viatura', () => {
    const aluguer = { 'mot-helder': 250 };
    const combustivel = {};
    expect(motoristasComCustos([combustivel, aluguer])).toEqual(['mot-helder']);
  });

  it('inclui motorista só com portagens', () => {
    expect(motoristasComCustos([{}, { 'mot-a': 1.99 }])).toEqual(['mot-a']);
  });

  it('não repete o motorista que tem vários custos', () => {
    expect(motoristasComCustos([{ 'mot-a': 10 }, { 'mot-a': 200, 'mot-b': 5 }])).toEqual([
      'mot-a',
      'mot-b',
    ]);
  });

  it('ignora valores a zero ou negativos', () => {
    expect(motoristasComCustos([{ 'mot-a': 0 }, { 'mot-b': -20 }])).toEqual([]);
  });
});
