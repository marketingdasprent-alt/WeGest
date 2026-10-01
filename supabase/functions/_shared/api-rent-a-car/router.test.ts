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
