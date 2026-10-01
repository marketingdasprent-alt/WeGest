import { describe, it, expect } from 'vitest';

import {
  INDICE_UMA_PARCELA_POR_SEMANA,
  mensagemErroMovimento,
  numeroDeParcelasValido,
} from './parcelasMovimento';

describe('numeroDeParcelasValido', () => {
  it('vazio não serve — tem de ser escrito por quem lança', () => {
    expect(numeroDeParcelasValido('', 1)).toBe(false);
    expect(numeroDeParcelasValido('  ', 1)).toBe(false);
  });

  it('acordo aceita 1 ou mais', () => {
    expect(numeroDeParcelasValido('1', 1)).toBe(true);
    expect(numeroDeParcelasValido('24', 1)).toBe(true);
    expect(numeroDeParcelasValido('0', 1)).toBe(false);
  });

  it('parcelas fixas exigem pelo menos 2', () => {
    expect(numeroDeParcelasValido('1', 2)).toBe(false);
    expect(numeroDeParcelasValido('2', 2)).toBe(true);
  });

  it('recusa decimais e texto', () => {
    expect(numeroDeParcelasValido('2.5', 1)).toBe(false);
    expect(numeroDeParcelasValido('abc', 1)).toBe(false);
  });
});

describe('mensagemErroMovimento', () => {
  it('traduz a recusa de duas parcelas na mesma semana (erro do Postgres, não instanceof Error)', () => {
    const erro = {
      code: '23505',
      message: `duplicate key value violates unique constraint "${INDICE_UMA_PARCELA_POR_SEMANA}"`,
    };
    expect(mensagemErroMovimento(erro)).toContain('semana diferente');
  });

  it('outras duplicações mantêm a mensagem original', () => {
    const erro = { code: '23505', message: 'duplicate key value violates unique constraint "x"' };
    expect(mensagemErroMovimento(erro)).toBe(erro.message);
  });

  it('erros comuns e desconhecidos', () => {
    expect(mensagemErroMovimento(new Error('falhou'))).toBe('falhou');
    expect(mensagemErroMovimento(null)).toBe('Erro inesperado');
  });
});
