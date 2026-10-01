import { assertEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { type LinhaAuditoria, tratarPedido } from './handler.ts';

const CHAVE = 'wg_ra_' + 'b'.repeat(48);
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

interface Opcoes {
  chave?: Record<string, unknown> | null;
  limite?: { allowed: boolean; retry_after: number };
  tarifa?: string | null;
  rebentar?: boolean;
}

function dbFalso(o: Opcoes = {}) {
  const pedidos: Record<string, unknown>[] = [];
  const rpcs: { name: string; args: Record<string, unknown> }[] = [];
  return {
    pedidos,
    rpcs,
    rpc(name: string, args: Record<string, unknown>) {
      rpcs.push({ name, args });
      if (name === 'api_chave_por_hash') {
        const linha = o.chave === undefined ? linhaOk : o.chave;
        return Promise.resolve({ data: linha ? [linha] : [], error: null });
      }
      if (name === 'consume_edge_rate_limit') {
        return Promise.resolve({
          data: o.limite ?? { allowed: true, retry_after: 0 },
          error: null,
        });
      }
      if (name === 'api_tarifa_site')
        return Promise.resolve({ data: o.tarifa ?? null, error: null });
      if (name === 'api_modelos') {
        if (o.rebentar) throw new Error('base em baixo');
        return Promise.resolve({ data: [{ id: 'm1' }], error: null });
      }
      return Promise.resolve({ data: null, error: { message: `rpc desconhecida: ${name}` } });
    },
    from(tabela: string) {
      return {
        insert(linha: LinhaAuditoria) {
          pedidos.push({ tabela, ...linha });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

function pedido(caminho: string, headers: Record<string, string> = {}, method = 'GET') {
  return new Request(`https://x${caminho}`, {
    method,
    headers: { 'x-api-key': CHAVE, 'cf-connecting-ip': '203.0.113.9', ...headers },
  });
}

async function correr(req: Request, db: ReturnType<typeof dbFalso>) {
  const { resposta, auditoria } = await tratarPedido(req, db);
  await auditoria;
  return resposta;
}

Deno.test('401 sem chave fica em api_pedidos com org e chave a null', async () => {
  const db = dbFalso();
  const r = await correr(
    new Request('https://x/v1/modelos?tipo=comercial', {
      headers: { 'cf-connecting-ip': '203.0.113.9' },
    }),
    db
  );
  assertEquals(r.status, 401);
  assertEquals(db.pedidos, [
    {
      tabela: 'api_pedidos',
      org_id: null,
      api_chave_id: null,
      metodo: 'GET',
      caminho: '/v1/modelos',
      estado_http: 401,
      duracao_ms: db.pedidos[0]?.duracao_ms,
      ip: '203.0.113.9',
    },
  ]);
  assertEquals(typeof db.pedidos[0].duracao_ms, 'number');
});

Deno.test('403 por chave desactivada fica em api_pedidos com org e chave da linha', async () => {
  const db = dbFalso({ chave: { ...linhaOk, ativo: false } });
  const r = await correr(pedido('/v1/modelos'), db);
  assertEquals(r.status, 403);
  assertEquals(db.pedidos.length, 1);
  assertEquals(db.pedidos[0].org_id, 'org1');
  assertEquals(db.pedidos[0].api_chave_id, 'k1');
  assertEquals(db.pedidos[0].estado_http, 403);
  // A recusa acontece antes do limite: a quota não é gasta.
  assertEquals(
    db.rpcs.some((c) => c.name === 'consume_edge_rate_limit'),
    false
  );
});

Deno.test('429 do limite fica em api_pedidos com org e chave, e traz Retry-After', async () => {
  const db = dbFalso({ limite: { allowed: false, retry_after: 42 } });
  const r = await correr(pedido('/v1/modelos'), db);
  assertEquals(r.status, 429);
  assertEquals(r.headers.get('retry-after'), '42');
  assertEquals((await r.json()).erro.codigo, 'LIMITE_EXCEDIDO');
  assertEquals(db.pedidos.length, 1);
  assertEquals(db.pedidos[0].org_id, 'org1');
  assertEquals(db.pedidos[0].api_chave_id, 'k1');
  assertEquals(db.pedidos[0].estado_http, 429);
  assertEquals(
    db.rpcs.some((c) => c.name === 'api_modelos'),
    false
  );
});

Deno.test(
  'pedido bom: catálogo servido, limite por chave e linha de auditoria com 200',
  async () => {
    const db = dbFalso();
    const r = await correr(pedido('/api-rent-a-car/v1/modelos?categoria=g1'), db);
    assertEquals(r.status, 200);
    assertEquals(await r.json(), [{ id: 'm1' }]);
    const limite = db.rpcs.find((c) => c.name === 'consume_edge_rate_limit');
    assertEquals(limite?.args.p_operation, 'api-rent-a-car');
    assertEquals(limite?.args.p_limit, 120);
    assertEquals(limite?.args.p_window_seconds, 60);
    assertMatch(String(limite?.args.p_subject_hash), /^[a-f0-9]{64}$/);
    assertEquals(db.pedidos[0].estado_http, 200);
    assertEquals(db.pedidos[0].caminho, '/api-rent-a-car/v1/modelos');
  }
);

Deno.test('limite da chave fica preso a 1..10000', async () => {
  for (const [configurado, aplicado] of [
    [0, 1],
    [50000, 10000],
  ] as const) {
    const db = dbFalso({ chave: { ...linhaOk, rate_limit_per_minute: configurado } });
    await correr(pedido('/v1/health'), db);
    assertEquals(db.rpcs.find((c) => c.name === 'consume_edge_rate_limit')?.args.p_limit, aplicado);
  }
});

Deno.test('/health diz se há tarifa do site', async () => {
  const r = await correr(pedido('/v1/health'), dbFalso({ tarifa: 't1' }));
  assertEquals(await r.json(), {
    ok: true,
    organizacao: 'org1',
    permissoes: ['catalogo:read'],
    tarifa_site: true,
  });
  const semTarifa = await correr(pedido('/v1/health'), dbFalso());
  assertEquals((await semTarifa.json()).tarifa_site, false);
});

Deno.test(
  'openapi.json, OPTIONS e rota inexistente não autenticam nem ficam na auditoria',
  async () => {
    const db = dbFalso();
    const spec = await correr(new Request('https://x/v1/openapi.json'), db);
    assertEquals(spec.status, 200);
    assertEquals((await spec.json()).openapi, '3.1.0');
    assertEquals(spec.headers.get('cache-control'), 'public, max-age=3600');
    const opts = await correr(new Request('https://x/v1/modelos', { method: 'OPTIONS' }), db);
    assertEquals(opts.headers.get('access-control-allow-origin'), 'https://wegest.pt');
    const fora = await correr(new Request('https://x/v2/modelos'), db);
    assertEquals(fora.status, 404);
    assertEquals(db.pedidos, []);
    assertEquals(db.rpcs, []);
  }
);

Deno.test('recurso desconhecido em /v1 → 404 auditado', async () => {
  const db = dbFalso();
  const r = await correr(pedido('/v1/reservas'), db);
  assertEquals(r.status, 404);
  assertEquals(db.pedidos[0].estado_http, 404);
});

Deno.test('excepção inesperada → 500 ERRO_INTERNO auditado', async () => {
  const db = dbFalso({ rebentar: true });
  const r = await correr(pedido('/v1/modelos'), db);
  assertEquals(r.status, 500);
  assertEquals((await r.json()).erro.codigo, 'ERRO_INTERNO');
  assertEquals(db.pedidos[0].estado_http, 500);
});
