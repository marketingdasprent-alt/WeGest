import { describe, it, expect } from 'vitest';

import { traduzirErroAuth, ERRO_AUTH_FALLBACK } from './erroAuth';

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
