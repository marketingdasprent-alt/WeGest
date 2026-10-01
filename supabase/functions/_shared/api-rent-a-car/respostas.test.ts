import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { CORS_HEADERS, erro, ok, respostaLimite } from './respostas.ts';

Deno.test('ok devolve JSON com CORS só para wegest.pt', async () => {
  const r = ok({ a: 1 });
  assertEquals(r.status, 200);
  assertEquals(r.headers.get('access-control-allow-origin'), 'https://wegest.pt');
  assertEquals(await r.json(), { a: 1 });
});

Deno.test('ok com cacheSeconds põe Cache-Control público', () => {
  const r = ok([], { cacheSeconds: 300 });
  assertEquals(r.headers.get('cache-control'), 'public, max-age=300');
});

Deno.test('erro tem sempre o envelope { erro: { codigo, mensagem } }', async () => {
  const r = erro('NAO_AUTENTICADO', 'Chave em falta', 401);
  assertEquals(r.status, 401);
  assertEquals(await r.json(), {
    erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Chave em falta' },
  });
  assertEquals(CORS_HEADERS['Access-Control-Allow-Headers'].includes('x-api-key'), true);
});

Deno.test('erro com detalhes inclui-os dentro do envelope', async () => {
  const r = erro('CORPO_INVALIDO', 'JSON inválido', 400, { campo: 'inicio' });
  assertEquals(await r.json(), {
    erro: { codigo: 'CORPO_INVALIDO', mensagem: 'JSON inválido', detalhes: { campo: 'inicio' } },
  });
});

Deno.test(
  'respostaLimite traduz a decisão do helper para o envelope { erro } com Retry-After',
  async () => {
    assertEquals(respostaLimite({ allowed: true }), null);

    const r429 = respostaLimite({ allowed: false, status: 429, retryAfter: 42 });
    assertEquals(r429?.status, 429);
    assertEquals(r429?.headers.get('retry-after'), '42');
    assertEquals(r429?.headers.get('access-control-expose-headers'), 'Retry-After');
    assertEquals((await r429?.json()).erro.codigo, 'LIMITE_EXCEDIDO');

    const r503 = respostaLimite({ allowed: false, status: 503, retryAfter: 30 });
    assertEquals(r503?.status, 503);
    assertEquals(r503?.headers.get('retry-after'), '30');
    assertEquals((await r503?.json()).erro.codigo, 'ERRO_INTERNO');
  }
);
