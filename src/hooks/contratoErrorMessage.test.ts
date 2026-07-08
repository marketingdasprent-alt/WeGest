import { describe, it, expect } from 'vitest';

import { errorMessage, isConflictError, contratoErrorMessage } from './useContratosRenting';

/**
 * Regressão: `error instanceof Error` é `false` para PostgrestError (objecto
 * plain devolvido pelo supabase-js, com .message/.code mas sem prototype de
 * Error) — um check baseado só nisso mascarava sempre a causa real do erro
 * atrás de "Erro inesperado". Estes testes fixam que qualquer shape de erro
 * com .message é lido correctamente.
 */

// Shape real de um erro do supabase-js — plain object, não instanceof Error.
const postgrestError = (over: Partial<{ message: string; code: string }> = {}) => ({
  message: 'mensagem original',
  details: null,
  hint: null,
  code: '23505',
  ...over,
});

describe('errorMessage', () => {
  it('lê .message de um Error nativo', () => {
    expect(errorMessage(new Error('falha nativa'))).toBe('falha nativa');
  });

  it('lê .message de um PostgrestError (objecto plain, não instanceof Error)', () => {
    const err = postgrestError({ message: 'duplicate key value' });
    expect(err instanceof Error).toBe(false);
    expect(errorMessage(err)).toBe('duplicate key value');
  });

  it('cai em String(error) quando não há .message', () => {
    expect(errorMessage({ code: 'X' })).toBe('[object Object]');
  });

  it('cai em String(error) para valores primitivos', () => {
    expect(errorMessage('erro em string')).toBe('erro em string');
    expect(errorMessage(null)).toBe('null');
    expect(errorMessage(undefined)).toBe('undefined');
  });

  it('ignora .message vazio ou não-string', () => {
    expect(errorMessage({ message: '' })).toBe('[object Object]');
    expect(errorMessage({ message: 42 })).toBe('[object Object]');
  });
});

describe('isConflictError', () => {
  it('detecta exclusion_violation pelo código 23P01', () => {
    expect(isConflictError(postgrestError({ code: '23P01', message: 'qualquer coisa' }))).toBe(
      true
    );
  });

  it('detecta pelo texto contratos_no_overbooking mesmo sem o código', () => {
    expect(
      isConflictError(
        postgrestError({
          code: '',
          message: 'violates exclusion constraint "contratos_no_overbooking"',
        })
      )
    ).toBe(true);
  });

  it('detecta a mensagem custom "Conflito: viatura já tem reserva"', () => {
    expect(
      isConflictError(new Error('Conflito: viatura já tem reserva activa neste período'))
    ).toBe(true);
  });

  it('não marca como conflito um erro qualquer', () => {
    expect(isConflictError(new Error('coluna não existe'))).toBe(false);
  });

  it('não marca como conflito quando error é null/undefined', () => {
    expect(isConflictError(null)).toBe(false);
    expect(isConflictError(undefined)).toBe(false);
  });
});

describe('contratoErrorMessage', () => {
  it('mapeia conflito de overbooking para mensagem amigável', () => {
    const { title, description } = contratoErrorMessage(
      postgrestError({ code: '23P01', message: 'exclusion_violation' })
    );
    expect(title).toBe('Conflito de disponibilidade');
    expect(description).toMatch(/sobreposta/);
  });

  it('mapeia violação de reserva já com contrato', () => {
    const { title, description } = contratoErrorMessage(
      postgrestError({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "uq_contratos_renting_reserva_id_active"',
      })
    );
    expect(title).toBe('Reserva já tem contrato');
    expect(description).toMatch(/já deu origem a um contrato/);
  });

  it('devolve a mensagem real do Postgres em qualquer outro erro (não mais "Erro inesperado")', () => {
    const { title, description } = contratoErrorMessage(
      postgrestError({ code: '23514', message: 'new row violates check constraint "chk_x"' })
    );
    expect(title).toBe('Erro');
    expect(description).toBe('new row violates check constraint "chk_x"');
  });

  it('devolve a mensagem de um Error nativo', () => {
    const { description } = contratoErrorMessage(new Error('falha de rede'));
    expect(description).toBe('falha de rede');
  });
});
