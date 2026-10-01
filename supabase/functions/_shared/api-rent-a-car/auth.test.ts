import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { autenticar, exigirPermissao, readApiKey, sha256Hex, type Recusa } from './auth.ts';

const CHAVE = 'wg_ra_' + 'a'.repeat(48);

function pedido(headers: Record<string, string> = {}) {
  return new Request('https://x/api-rent-a-car/v1/modelos', {
    headers: { 'x-api-key': CHAVE, ...headers },
  });
}

function db(linha: Record<string, unknown> | null) {
  return {
    rpc(name: string, _args: Record<string, unknown>) {
      assertEquals(name, 'api_chave_por_hash');
      return Promise.resolve({ data: linha ? [linha] : [], error: null });
    },
  };
}

const linhaOk = {
  id: 'k1',
  org_id: 'org1',
  nome: 'Site',
  escopo: 'rent_a_car',
  permissoes: ['catalogo:read'],
  ativo: true,
  ip_whitelist: [],
  rate_limit_per_minute: 120,
  expires_at: null,
};

const recusa = (r: unknown) => r as Recusa;

Deno.test('readApiKey lê X-API-Key ou Authorization Bearer', () => {
  assertEquals(readApiKey(pedido()), CHAVE);
  assertEquals(
    readApiKey(new Request('https://x', { headers: { authorization: `Bearer ${CHAVE}` } })),
    CHAVE
  );
  assertEquals(readApiKey(new Request('https://x')), null);
});

Deno.test('sha256Hex é determinístico e hex de 64', async () => {
  const h = await sha256Hex('abc');
  assertEquals(h, 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

Deno.test('sem chave → 401 NAO_AUTENTICADO, sem chave identificada', async () => {
  const r = recusa(await autenticar(new Request('https://x/v1/modelos'), db(linhaOk)));
  assertEquals(r.recusa.status, 401);
  assertEquals((await r.recusa.json()).erro.codigo, 'NAO_AUTENTICADO');
  assertEquals(r.chave, undefined);
});

Deno.test('chave desconhecida → 401, sem chave identificada', async () => {
  const r = recusa(await autenticar(pedido(), db(null)));
  assertEquals(r.recusa.status, 401);
  assertEquals(r.chave, undefined);
});

Deno.test('a chave vai à base como hash, nunca em claro', async () => {
  const esperado = await sha256Hex(CHAVE);
  let recebido: unknown = null;
  await autenticar(pedido(), {
    rpc(_name: string, args: Record<string, unknown>) {
      recebido = args.p_hash;
      return Promise.resolve({ data: [linhaOk], error: null });
    },
  });
  assertEquals(recebido, esperado);
});

Deno.test(
  'chave de contabilidade não entra nesta API → 403 SEM_PERMISSAO, com a chave',
  async () => {
    const r = recusa(await autenticar(pedido(), db({ ...linhaOk, escopo: 'contabilidade' })));
    assertEquals(r.recusa.status, 403);
    assertEquals((await r.recusa.json()).erro.codigo, 'SEM_PERMISSAO');
    assertEquals(r.chave, { id: 'k1', orgId: 'org1' });
  }
);

Deno.test('chave desactivada ou expirada → 403 e identifica a chave recusada', async () => {
  const desactivada = recusa(await autenticar(pedido(), db({ ...linhaOk, ativo: false })));
  assertEquals(desactivada.recusa.status, 403);
  assertEquals(desactivada.chave, { id: 'k1', orgId: 'org1' });
  const expirada = recusa(
    await autenticar(pedido(), db({ ...linhaOk, expires_at: '2000-01-01T00:00:00Z' }))
  );
  assertEquals(expirada.recusa.status, 403);
  assertEquals(expirada.chave, { id: 'k1', orgId: 'org1' });
});

Deno.test('whitelist usa o IP de confiança, não o X-Forwarded-For cru', async () => {
  // trustedRequestIp lê cf-connecting-ip primeiro; o 1.º valor do XFF é forjável.
  const r = recusa(
    await autenticar(
      pedido({ 'x-forwarded-for': '1.2.3.4, 9.9.9.9', 'cf-connecting-ip': '9.9.9.9' }),
      db({ ...linhaOk, ip_whitelist: ['1.2.3.4'] })
    )
  );
  assertEquals(r.recusa.status, 403);
  assertEquals(r.chave, { id: 'k1', orgId: 'org1' });
});

Deno.test('whitelist aceita o IP de confiança quando está na lista', async () => {
  const ctx = await autenticar(
    pedido({ 'x-forwarded-for': '1.2.3.4, 9.9.9.9', 'cf-connecting-ip': '9.9.9.9' }),
    db({ ...linhaOk, ip_whitelist: ['9.9.9.9'] })
  );
  assertEquals((ctx as { orgId: string }).orgId, 'org1');
});

Deno.test('chave válida devolve o contexto', async () => {
  const ctx = await autenticar(pedido(), db(linhaOk));
  assertEquals(ctx, {
    chaveId: 'k1',
    orgId: 'org1',
    permissoes: ['catalogo:read'],
    limitePorMinuto: 120,
  });
});

Deno.test('exigirPermissao → null quando tem, 403 quando não tem', () => {
  const ctx = { chaveId: 'k1', orgId: 'org1', permissoes: ['catalogo:read'], limitePorMinuto: 120 };
  assertEquals(exigirPermissao(ctx, 'catalogo:read'), null);
  assertEquals((exigirPermissao(ctx, 'reservas:write') as Response).status, 403);
});

Deno.test(
  'erro da RPC api_chave_por_hash → 503 ERRO_INTERNO, nunca 401 "desconhecida"',
  async () => {
    const r = recusa(
      await autenticar(pedido(), {
        rpc: () => Promise.resolve({ data: null, error: { message: 'relation missing' } }),
      })
    );
    assertEquals(r.recusa.status, 503);
    assertEquals((await r.recusa.json()).erro.codigo, 'ERRO_INTERNO');
    assertEquals(r.chave, undefined);
  }
);
