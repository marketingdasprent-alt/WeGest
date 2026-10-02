import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { CORS_HEADERS, comCors, erro, ok, origemPermitida, respostaLimite } from './respostas.ts';

const comOrigem = (origin?: string) =>
  new Request('https://x/v1/modelos', { headers: origin ? { origin } : {} });

Deno.test('ok devolve JSON; o ACAO não vem de ok(), vem de comCors', async () => {
  const r = ok({ a: 1 });
  assertEquals(r.status, 200);
  assertEquals(r.headers.get('content-type'), 'application/json');
  assertEquals(r.headers.get('access-control-allow-origin'), null);
  assertEquals(r.headers.get('vary'), 'Origin');
  assertEquals(await r.json(), { a: 1 });
});

Deno.test('ok com cacheSeconds é PRIVADO e varia por chave (resposta por organização)', () => {
  const r = ok([], { cacheSeconds: 300 });
  assertEquals(r.headers.get('cache-control'), 'private, max-age=300');
  assertEquals(r.headers.get('vary'), 'Origin, X-API-Key, Authorization');
});

Deno.test('ok publico (só openapi.json) pode ir para caches partilhadas', () => {
  const r = ok({}, { cacheSeconds: 3600, publico: true });
  assertEquals(r.headers.get('cache-control'), 'public, max-age=3600');
  assertEquals(r.headers.get('vary'), 'Origin');
});

Deno.test('ok sem cacheSeconds não põe Cache-Control', () => {
  assertEquals(ok({}).headers.get('cache-control'), null);
});

Deno.test('ok com semCache põe Cache-Control: no-store (disponibilidade e cotação)', () => {
  const r = ok({}, { semCache: true });
  assertEquals(r.headers.get('cache-control'), 'no-store');
  assertEquals(r.headers.get('vary'), 'Origin');
});

Deno.test(
  'CORS: wegest.pt e www.wegest.pt recebem o seu ACAO; origem estranha não recebe nenhum',
  () => {
    assertEquals(origemPermitida(comOrigem('https://wegest.pt')), 'https://wegest.pt');
    assertEquals(origemPermitida(comOrigem('https://www.wegest.pt')), 'https://www.wegest.pt');
    assertEquals(origemPermitida(comOrigem('https://docs.wegest.pt')), 'https://docs.wegest.pt');
    assertEquals(origemPermitida(comOrigem('https://evil.example')), null);
    assertEquals(origemPermitida(comOrigem('https://docs.wegest.pt.evil.example')), null);
    assertEquals(origemPermitida(comOrigem()), null);

    const a = comCors(comOrigem('https://wegest.pt'), ok({}));
    assertEquals(a.headers.get('access-control-allow-origin'), 'https://wegest.pt');
    const b = comCors(comOrigem('https://www.wegest.pt'), erro('NAO_AUTENTICADO', 'x', 401));
    assertEquals(b.headers.get('access-control-allow-origin'), 'https://www.wegest.pt');
    const c = comCors(comOrigem('https://evil.example'), ok({}));
    assertEquals(c.headers.get('access-control-allow-origin'), null);
    assertEquals(CORS_HEADERS['Access-Control-Allow-Headers'].includes('x-api-key'), true);
    assertEquals('Access-Control-Allow-Origin' in CORS_HEADERS, false);
  }
);

Deno.test('erro tem sempre o envelope { erro: { codigo, mensagem } }', async () => {
  const r = erro('NAO_AUTENTICADO', 'Chave em falta', 401);
  assertEquals(r.status, 401);
  assertEquals(await r.json(), {
    erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Chave em falta' },
  });
  assertEquals(r.headers.get('cache-control'), null);
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
