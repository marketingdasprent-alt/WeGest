import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { erro } from './respostas.ts';
import { confirmarSessao, lerTokenSessao, type VerificadorSessao } from './sessao.ts';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJh';
const OUTRO = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MiJ9.b3V0cmE';
const USER_ID = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';

const pedido = (h: Record<string, string>) => new Request('https://x/v1/conta', { headers: h });
type Sessao = { data: { user: { id: string } | null }; error: unknown };
const verificador = (s: Sessao, tokens: string[] = []): VerificadorSessao => ({
  auth: {
    getUser(jwt: string) {
      tokens.push(jwt);
      return Promise.resolve(s);
    },
  },
});

Deno.test('lerTokenSessao: X-Conta-Token, X-Motorista-Token e nenhum', () => {
  assertEquals(lerTokenSessao(pedido({ 'X-Conta-Token': ` ${TOKEN} ` })), { token: TOKEN });
  assertEquals(lerTokenSessao(pedido({ 'X-Motorista-Token': TOKEN })), { token: TOKEN });
  assertEquals(lerTokenSessao(pedido({})), { token: null });
  assertEquals(lerTokenSessao(pedido({ 'x-conta-token': '   ' })), { token: null });
});

Deno.test('lerTokenSessao: com os dois cabeçalhos vale o X-Conta-Token', () => {
  const h = { 'x-conta-token': TOKEN, 'x-motorista-token': OUTRO };
  assertEquals(lerTokenSessao(pedido(h)), { token: TOKEN });
  // Um X-Conta-Token vazio não esconde o X-Motorista-Token.
  assertEquals(lerTokenSessao(pedido({ 'x-conta-token': ' ', 'x-motorista-token': OUTRO })), {
    token: OUTRO,
  });
});

Deno.test('lerTokenSessao: sem forma de JWT ou acima de 4096 → 401 SESSAO_INVALIDA', async () => {
  for (const token of ['nao-e-jwt', 'a.b', `${'a'.repeat(4095)}.b.cc`, 'a.b.c%2f']) {
    const r = lerTokenSessao(pedido({ 'x-conta-token': token }));
    assert('recusa' in r, token.slice(0, 20));
    if ('recusa' in r) {
      assertEquals(r.recusa.status, 401);
      assertEquals((await r.recusa.json()).erro.codigo, 'SESSAO_INVALIDA');
    }
  }
});

Deno.test('lerTokenSessao e confirmarSessao usam a recusa pedida', async () => {
  const minha = () => erro('SESSAO_INVALIDA', 'Sessão do motorista inválida.', 401);
  const r = lerTokenSessao(pedido({ 'x-motorista-token': 'x' }), minha);
  assert('recusa' in r);
  if ('recusa' in r)
    assertEquals((await r.recusa.json()).erro.mensagem, 'Sessão do motorista inválida.');
  const c = await confirmarSessao(verificador({ data: { user: null }, error: null }), TOKEN, minha);
  assert('recusa' in c);
  if ('recusa' in c)
    assertEquals((await c.recusa.json()).erro.mensagem, 'Sessão do motorista inválida.');
});

Deno.test('confirmarSessao: token bom → id da conta, confirmado no GoTrue', async () => {
  const tokens: string[] = [];
  const r = await confirmarSessao(
    verificador({ data: { user: { id: USER_ID } }, error: null }, tokens),
    TOKEN
  );
  assertEquals(r, { userId: USER_ID });
  assertEquals(tokens, [TOKEN]);
});

Deno.test('confirmarSessao: token rejeitado (4xx ou sem user) → 401', async () => {
  for (const s of [
    { data: { user: null }, error: { message: 'invalid JWT', status: 403 } },
    { data: { user: null }, error: { message: 'bad', status: 401 } },
    { data: { user: null }, error: null },
  ]) {
    const r = await confirmarSessao(verificador(s), TOKEN);
    assert('recusa' in r);
    if ('recusa' in r) assertEquals(r.recusa.status, 401);
  }
});

Deno.test('confirmarSessao: GoTrue em baixo ou a limitar → 503, não 401', async () => {
  for (const error of [{ status: 0 }, { status: 429 }, { status: 500 }, { message: 'x' }, {}]) {
    const r = await confirmarSessao(verificador({ data: { user: null }, error }), TOKEN);
    assert('recusa' in r);
    if ('recusa' in r) {
      assertEquals(r.recusa.status, 503);
      assertEquals((await r.recusa.json()).erro.codigo, 'ERRO_INTERNO');
    }
  }
});

Deno.test('confirmarSessao não escreve nada nos logs (nem o token nem o email)', async () => {
  const registos: unknown[][] = [];
  const originais = { error: console.error, warn: console.warn, log: console.log };
  console.error =
    console.warn =
    console.log =
      (...a: unknown[]) => {
        registos.push(a);
      };
  try {
    await confirmarSessao(
      verificador({
        data: { user: null },
        error: { message: 'ana@exemplo.pt expirou', status: 403 },
      }),
      TOKEN
    );
    await confirmarSessao(verificador({ data: { user: null }, error: { status: 500 } }), TOKEN);
  } finally {
    Object.assign(console, originais);
  }
  assertEquals(registos, []);
});
