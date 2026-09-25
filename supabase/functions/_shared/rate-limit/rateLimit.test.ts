import { assertEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  consumeRateLimit,
  hashRateLimitIdentity,
  rateLimitResponse,
  trustedRequestIp,
} from './rateLimit.ts';

const options = { operation: 'register-org', identity: 'origin-a', limit: 5, windowSeconds: 3600 };

Deno.test('reserva quota no servidor e nunca envia a identidade em claro', async () => {
  const result = await consumeRateLimit(
    {
      rpc(name, args) {
        assertEquals(name, 'consume_edge_rate_limit');
        assertEquals(args.p_operation, 'register-org');
        assertEquals(args.p_limit, 5);
        assertEquals(args.p_window_seconds, 3600);
        assertMatch(String(args.p_subject_hash), /^[a-f0-9]{64}$/);
        return Promise.resolve({ data: { allowed: true, retry_after: 0 }, error: null });
      },
    },
    options
  );
  assertEquals(result, { allowed: true });
});

Deno.test('quota excedida responde 429 com Retry-After visível no browser', async () => {
  const result = await consumeRateLimit(
    {
      rpc: () =>
        Promise.resolve({
          data: { allowed: false, retry_after: 42 },
          error: null,
        }),
    },
    options
  );
  const response = rateLimitResponse(result, { 'Access-Control-Allow-Origin': '*' });
  assertEquals(response?.status, 429);
  assertEquals(response?.headers.get('Retry-After'), '42');
  assertEquals(response?.headers.get('Access-Control-Expose-Headers'), 'Retry-After');
});

Deno.test('falha da BD, exceção, capacidade e resposta inválida fecham com 503', async () => {
  for (const reply of [
    { data: null, error: { message: 'database unavailable' } },
    { data: null, error: null },
    { data: { allowed: true, retry_after: 'invalid' }, error: null },
    { data: { allowed: false, retry_after: 30, unavailable: true }, error: null },
  ]) {
    const result = await consumeRateLimit({ rpc: () => Promise.resolve(reply) }, options);
    assertEquals(rateLimitResponse(result, {})?.status, 503);
  }
  const result = await consumeRateLimit(
    {
      rpc: () => {
        throw new Error('offline');
      },
    },
    options
  );
  assertEquals(rateLimitResponse(result, {})?.status, 503);
});

Deno.test(
  'IP usa o proxy conhecido ou último XFF; nunca aceita o primeiro XFF nem x-real-ip',
  () => {
    const request = (headers: Record<string, string>) =>
      new Request('https://example.test', { headers });
    assertEquals(
      trustedRequestIp(
        request({ 'cf-connecting-ip': '203.0.113.2', 'x-forwarded-for': '192.0.2.1, 203.0.113.3' })
      ),
      '203.0.113.2'
    );
    assertEquals(
      trustedRequestIp(request({ 'x-forwarded-for': '192.0.2.1, 203.0.113.3' })),
      '203.0.113.3'
    );
    assertEquals(trustedRequestIp(request({ 'x-real-ip': '192.0.2.1' })), 'unknown');
    assertEquals(trustedRequestIp(request({ 'cf-connecting-ip': 'arbitrary-header' })), 'unknown');
  }
);

Deno.test('hash de identidade usa segredo quando contém IP e normaliza IPv6', async () => {
  const first = await hashRateLimitIdentity('203.0.113.2', 'server-secret');
  assertMatch(first, /^[a-f0-9]{64}$/);
  assertEquals(first === (await hashRateLimitIdentity('203.0.113.2', 'other-secret')), false);
  assertEquals(
    trustedRequestIp(
      new Request('https://example.test', {
        headers: {
          'cf-connecting-ip': '2001:0db8:0000:0000:0000:0000:0000:0001',
        },
      })
    ),
    '2001:db8::1'
  );
});
