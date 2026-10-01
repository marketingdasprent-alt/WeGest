import { describe, expect, it } from 'vitest';
import { mensagemDeErroDaFuncao } from './erroFuncaoEdge';

// O supabase-js devolve sempre "Edge Function returned a non-2xx status code";
// a razão real vem na Response em error.context.
const erroComResposta = (status: number, corpo: unknown, headers: Record<string, string> = {}) => ({
  message: 'Edge Function returned a non-2xx status code',
  context: new Response(JSON.stringify(corpo), { status, headers }),
});

describe('mensagemDeErroDaFuncao', () => {
  it('com 429 diz quantos minutos esperar, a partir do Retry-After', async () => {
    const erro = erroComResposta(429, { error: 'Demasiados pedidos.' }, { 'Retry-After': '1200' });
    expect(await mensagemDeErroDaFuncao(erro, 'fallback')).toBe(
      'Demasiados pedidos. Tente novamente daqui a 20 minutos.'
    );
  });

  it('arredonda para cima e fala em 1 minuto no singular', async () => {
    const erro = erroComResposta(429, {}, { 'Retry-After': '30' });
    expect(await mensagemDeErroDaFuncao(erro, 'fallback')).toBe(
      'Demasiados pedidos. Tente novamente daqui a 1 minuto.'
    );
  });

  it('noutros erros mostra a mensagem que a função devolveu', async () => {
    const erro = erroComResposta(403, { error: 'Sem acesso ao utilizador nesta organização' });
    expect(await mensagemDeErroDaFuncao(erro, 'fallback')).toBe(
      'Sem acesso ao utilizador nesta organização'
    );
  });

  it('sem resposta legível usa o fallback', async () => {
    expect(await mensagemDeErroDaFuncao(new Error('rede em baixo'), 'fallback')).toBe('fallback');
    expect(
      await mensagemDeErroDaFuncao(
        { message: 'x', context: new Response('não é json', { status: 500 }) },
        'fallback'
      )
    ).toBe('fallback');
  });
});
