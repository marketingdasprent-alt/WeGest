import { describe, it, expect } from 'vitest';
import { papeisEmFalta } from './assinaturasHandover';

describe('papeisEmFalta', () => {
  it('devolve ambos os papéis quando nada está assinado', () => {
    expect(papeisEmFalta({ motorista: null, responsavel: null })).toEqual([
      'motorista',
      'responsavel',
    ]);
  });

  it('devolve só responsavel quando o motorista assinou', () => {
    expect(papeisEmFalta({ motorista: 'data:image/png;base64,AAA', responsavel: null })).toEqual([
      'responsavel',
    ]);
  });

  it('devolve vazio quando ambos assinaram', () => {
    expect(
      papeisEmFalta({
        motorista: 'data:image/png;base64,AAA',
        responsavel: 'data:image/png;base64,BBB',
      })
    ).toEqual([]);
  });

  it('trata string vazia como em falta', () => {
    expect(papeisEmFalta({ motorista: '', responsavel: 'data:image/png;base64,BBB' })).toEqual([
      'motorista',
    ]);
  });
});
