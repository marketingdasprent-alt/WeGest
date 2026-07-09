import { describe, it, expect } from 'vitest';

import { errorMessage } from './errorMessage';

/**
 * Regressão real (2026-07-08): o fluxo de check-in por QR (RealizarEntregaPage)
 * grava km/combustível via RPC autorizada pelo token. Quando a RPC falhava
 * (ex: sem permissão renting_contratos, ou erro do Postgres), o handler de
 * erro fazia `error instanceof Error ? error.message : 'Erro inesperado'` —
 * mas o erro do supabase-js é um PostgrestError (objecto plain, .message
 * existe mas NÃO é instanceof Error), por isso o toast mostrava sempre
 * "Erro inesperado" e escondia a causa real. O gestor preenchia a folha de
 * danos, o submit falhava silenciosamente (mensagem genérica, sem indicar
 * o quê), e os dados "não tinham para onde ir".
 */

const postgrestError = (message: string) => ({
  message,
  details: null,
  hint: null,
  code: '42501',
});

describe('errorMessage', () => {
  it('lê .message de um Error nativo', () => {
    expect(errorMessage(new Error('falha nativa'))).toBe('falha nativa');
  });

  it('lê .message de um PostgrestError (objecto plain, não instanceof Error)', () => {
    const err = postgrestError('permission denied for table contratos_renting');
    expect(err instanceof Error).toBe(false);
    expect(errorMessage(err)).toBe('permission denied for table contratos_renting');
  });

  it('usa o fallback (não "[object Object]") quando não há .message', () => {
    expect(errorMessage({ code: 'X' })).toBe('Erro inesperado');
  });

  it('aceita um fallback customizado', () => {
    expect(errorMessage(null, 'Falha ao gravar')).toBe('Falha ao gravar');
  });

  it('ignora .message vazio ou não-string, usa o fallback', () => {
    expect(errorMessage({ message: '' })).toBe('Erro inesperado');
    expect(errorMessage({ message: 42 })).toBe('Erro inesperado');
  });

  it('lê .message de valores primitivos ausentes sem rebentar', () => {
    expect(errorMessage(undefined)).toBe('Erro inesperado');
    expect(errorMessage('erro em string')).toBe('Erro inesperado');
  });
});
