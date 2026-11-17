import { describe, it, expect } from 'vitest';

import {
  traduzirErroAuth,
  ERRO_AUTH_FALLBACK,
  ehEmailSemConta,
  ehEmailNaoConfirmado,
} from './erroAuth';

describe('ehEmailSemConta', () => {
  it('reconhece o código do OTP para email sem conta', () => {
    expect(ehEmailSemConta({ code: 'otp_disabled', message: 'x' })).toBe(true);
  });

  it('reconhece a mensagem quando o código não vem', () => {
    expect(ehEmailSemConta(new Error('Signups not allowed for otp'))).toBe(true);
  });

  it('não engole os outros erros', () => {
    expect(ehEmailSemConta(new Error('Email rate limit exceeded'))).toBe(false);
    expect(ehEmailSemConta(null)).toBe(false);
  });
});

describe('traduzirErroAuth', () => {
  it('traduz credenciais inválidas e sugere a recuperação', () => {
    const msg = traduzirErroAuth(new Error('Invalid login credentials'));
    expect(msg).toContain('Email ou palavra-passe incorretos');
    expect(msg).toContain('Esqueceu-se da palavra-passe?');
  });

  it('aceita o objecto plain do supabase-js (não é instanceof Error)', () => {
    expect(traduzirErroAuth({ message: 'Invalid login credentials' })).toContain(
      'Email ou palavra-passe incorretos'
    );
  });

  it('traduz email por confirmar', () => {
    expect(traduzirErroAuth(new Error('Email not confirmed'))).toContain(
      'ainda não foi confirmada'
    );
  });

  it('traduz rate limit', () => {
    expect(traduzirErroAuth(new Error('Email rate limit exceeded'))).toContain(
      'Demasiadas tentativas'
    );
  });

  it('traduz link expirado', () => {
    expect(traduzirErroAuth(new Error('Email link is invalid or has expired'))).toContain(
      'O link expirou'
    );
  });

  it('traduz falha de rede', () => {
    expect(traduzirErroAuth(new TypeError('Failed to fetch'))).toContain('Falha de ligação');
  });

  it('usa o fallback quando não há mensagem', () => {
    expect(traduzirErroAuth(undefined)).toBe(ERRO_AUTH_FALLBACK);
    expect(traduzirErroAuth(new Error(''), 'xpto')).toBe('xpto');
  });

  it('devolve a mensagem original quando não conhece o erro', () => {
    expect(traduzirErroAuth(new Error('Boom desconhecido'))).toBe('Boom desconhecido');
  });
});

describe('ehEmailNaoConfirmado', () => {
  it('reconhece o erro de login com email por confirmar', () => {
    expect(ehEmailNaoConfirmado({ code: 'email_not_confirmed', message: 'x' })).toBe(true);
    expect(ehEmailNaoConfirmado(new Error('Email not confirmed'))).toBe(true);
  });
  it('não confunde com credenciais erradas', () => {
    expect(ehEmailNaoConfirmado(new Error('Invalid login credentials'))).toBe(false);
    expect(ehEmailNaoConfirmado(null)).toBe(false);
  });
});

describe('traduzirErroAuth: pedido repetido cedo demais', () => {
  it('traduz o limite de segundos do Supabase', () => {
    expect(
      traduzirErroAuth(
        new Error('For security purposes, you can only request this after 52 seconds.')
      )
    ).toBe('Aguarde cerca de um minuto antes de pedir outro email.');
  });
  it('mantém o aviso do limite por hora', () => {
    expect(traduzirErroAuth(new Error('email rate limit exceeded'))).toMatch(
      /Demasiadas tentativas/
    );
  });
});
