// Traduz para português os erros do Supabase Auth (login, recuperação de
// palavra-passe, magic link). O supabase-js devolve sempre as mensagens em
// inglês e propositadamente genéricas — "Invalid login credentials" não diz
// se falhou o email ou a palavra-passe, para não permitir descobrir que
// contas existem. Mantemos essa ambiguidade, mas dizemos ao utilizador o que
// pode fazer a seguir.

import { errorMessage } from '@/utils/errorMessage';

export const ERRO_AUTH_FALLBACK = 'Não foi possível iniciar sessão. Tente novamente.';

export function traduzirErroAuth(error: unknown, fallback = ERRO_AUTH_FALLBACK): string {
  const original = errorMessage(error, '');
  const m = original.toLowerCase();

  if (!m) return fallback;

  if (m.includes('invalid login credentials') || m.includes('invalid credentials'))
    return 'Email ou palavra-passe incorretos. Confirme os dados introduzidos — se não se lembrar da palavra-passe, use "Esqueceu-se da palavra-passe?" para a redefinir.';
  if (m.includes('email not confirmed') || m.includes('email_not_confirmed'))
    return 'A sua conta ainda não foi confirmada. Verifique o email (incluindo a pasta de spam) e clique no link de confirmação.';
  if (m.includes('user not found') || m.includes('no user found'))
    return 'Não existe nenhuma conta com este email.';
  if (m.includes('banned') || m.includes('disabled') || m.includes('user_banned'))
    return 'Esta conta está bloqueada. Contacte o administrador da sua empresa.';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('exceeded'))
    return 'Demasiadas tentativas. Aguarde uns minutos e tente novamente.';
  if (m.includes('expired') && (m.includes('link') || m.includes('token') || m.includes('otp')))
    return 'O link expirou ou já foi utilizado. Peça um novo email de acesso.';
  if (m.includes('invalid') && m.includes('email')) return 'O email introduzido não é válido.';
  if (m.includes('signups not allowed') || m.includes('signup is disabled'))
    return 'O registo de novas contas está desativado. Contacte o administrador da sua empresa.';
  if (m.includes('network') || m.includes('failed to fetch') || m.includes('fetch'))
    return 'Falha de ligação. Verifique a sua internet e tente novamente.';

  return original || fallback;
}
