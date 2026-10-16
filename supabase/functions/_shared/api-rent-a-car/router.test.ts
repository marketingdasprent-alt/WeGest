import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolverRota } from './router.ts';

Deno.test('resolve recurso e id com e sem prefixo da função', () => {
  assertEquals(resolverRota(new URL('https://x/api-rent-a-car/v1/modelos/abc'), 'GET'), {
    metodo: 'GET',
    recurso: 'modelos',
    id: 'abc',
  });
  assertEquals(resolverRota(new URL('https://x/v1/categorias'), 'GET'), {
    metodo: 'GET',
    recurso: 'categorias',
    id: null,
  });
  assertEquals(resolverRota(new URL('https://x/v1/categorias/'), 'GET')?.recurso, 'categorias');
});

Deno.test('fora de /v1 é null', () => {
  assertEquals(resolverRota(new URL('https://x/v2/modelos'), 'GET'), null);
  assertEquals(resolverRota(new URL('https://x/api-rent-a-car'), 'GET'), null);
  assertEquals(resolverRota(new URL('https://x/v1'), 'GET'), null);
});

Deno.test('openapi.json é um recurso de /v1 (tem ponto no nome)', () => {
  assertEquals(resolverRota(new URL('https://x/api-rent-a-car/v1/openapi.json'), 'GET'), {
    metodo: 'GET',
    recurso: 'openapi.json',
    id: null,
  });
});

Deno.test('método fora de GET/POST/DELETE é null', () => {
  assertEquals(resolverRota(new URL('https://x/v1/modelos'), 'PUT'), null);
  assertEquals(resolverRota(new URL('https://x/v1/reservas/r1'), 'DELETE')?.metodo, 'DELETE');
});

Deno.test('id mal codificado não rebenta: é null', () => {
  assertEquals(resolverRota(new URL('https://x/v1/modelos/%E0%A4%A'), 'GET'), null);
});

Deno.test('id só aceita [A-Za-z0-9_-]: espaços codificados e barras não entram', () => {
  assertEquals(resolverRota(new URL('https://x/v1/modelos/abc%20def'), 'GET'), null);
  assertEquals(resolverRota(new URL('https://x/v1/modelos/a.b'), 'GET'), null);
  assertEquals(
    resolverRota(new URL('https://x/v1/modelos/2b7c0b7e-1111-4222-8333-444455556666'), 'GET')?.id,
    '2b7c0b7e-1111-4222-8333-444455556666'
  );
});

Deno.test('tvde/ é prefixo do recurso, não recurso com id', () => {
  const uuid = '2b7c0b7e-1111-4222-8333-444455556666';
  assertEquals(resolverRota(new URL('https://x/v1/tvde/modelos'), 'GET'), {
    metodo: 'GET',
    recurso: 'tvde/modelos',
    id: null,
  });
  assertEquals(resolverRota(new URL(`https://x/v1/tvde/modelos/${uuid}`), 'GET'), {
    metodo: 'GET',
    recurso: 'tvde/modelos',
    id: uuid,
  });
  assertEquals(resolverRota(new URL('https://x/api-rent-a-car/v1/tvde/disponibilidade'), 'GET'), {
    metodo: 'GET',
    recurso: 'tvde/disponibilidade',
    id: null,
  });
});

Deno.test('tvde sozinho, repetido ou colado ao recurso não abre rotas TVDE', () => {
  // /v1/tvde e /v1/tvdemodelos resolvem, mas nenhum serviço os conhece (404 no handler).
  assertEquals(resolverRota(new URL('https://x/v1/tvde'), 'GET')?.recurso, 'tvde');
  assertEquals(resolverRota(new URL('https://x/v1/tvde/'), 'GET')?.recurso, 'tvde');
  assertEquals(resolverRota(new URL('https://x/v1/tvdemodelos'), 'GET')?.recurso, 'tvdemodelos');
  assertEquals(resolverRota(new URL('https://x/v1/tvde/tvde/modelos'), 'GET'), null);
  assertEquals(resolverRota(new URL('https://x/v1/tvde/modelos/a/b'), 'GET'), null);
});

Deno.test('rotas existentes não mudam com o prefixo tvde/', () => {
  const casos: [string, string, string | null][] = [
    ['/v1/openapi.json', 'openapi.json', null],
    ['/api-rent-a-car/v1/health', 'health', null],
    ['/v1/reservas/123', 'reservas', '123'],
    ['/v1/modelos/abc/', 'modelos', 'abc'],
    ['/v1/disponibilidade', 'disponibilidade', null],
  ];
  for (const [caminho, recurso, id] of casos) {
    assertEquals(
      resolverRota(new URL(`https://x${caminho}`), 'GET'),
      { metodo: 'GET', recurso, id },
      caminho
    );
  }
});

Deno.test('conta/ é prefixo como tvde/; /v1/conta sozinho é o recurso conta', () => {
  const uuid = '2b7c0b7e-1111-4222-8333-444455556666';
  const casos: [string, string, string, string | null][] = [
    ['/v1/conta', 'GET', 'conta', null],
    ['/v1/conta/', 'GET', 'conta', null],
    ['/api-rent-a-car/v1/conta', 'GET', 'conta', null],
    ['/v1/conta/reservas', 'GET', 'conta/reservas', null],
    ['/v1/conta/reservas/1042', 'DELETE', 'conta/reservas', '1042'],
    ['/v1/conta/faturas', 'GET', 'conta/faturas', null],
    [`/api-rent-a-car/v1/conta/faturas/${uuid}`, 'GET', 'conta/faturas', uuid],
  ];
  for (const [caminho, metodo, recurso, id] of casos) {
    assertEquals(
      resolverRota(new URL(`https://x${caminho}`), metodo),
      { metodo, recurso, id },
      caminho
    );
  }
});

Deno.test('conta: prefixos repetidos, misturados, % e segmentos a mais não entram', () => {
  for (const caminho of [
    '/v1/conta/conta/reservas',
    '/v1/conta/tvde/modelos',
    '/v1/tvde/conta/reservas',
    '/v1/conta/reservas/1/extra',
    '/v1/conta/faturas/a.b',
    '/v1/conta/faturas/a%2fb',
    '/v1/conta%2freservas',
  ]) {
    assertEquals(resolverRota(new URL(`https://x${caminho}`), 'GET'), null, caminho);
  }
  // Resolvem, mas nenhum serviço os conhece (404 em servirConta).
  assertEquals(resolverRota(new URL('https://x/v1/conta/123'), 'GET')?.id, '123');
  assertEquals(resolverRota(new URL('https://x/v1/contas'), 'GET')?.recurso, 'contas');
});
