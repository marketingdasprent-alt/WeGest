import { assertEquals, assertMatch } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { type LinhaAuditoria, tratarPedido } from './handler.ts';

const CHAVE = 'wg_ra_' + 'b'.repeat(48);
const UUID = '2b7c0b7e-1111-4222-8333-444455556666';
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

type Decisao = { allowed: boolean; retry_after: number };
interface Opcoes {
  chave?: Record<string, unknown> | null;
  limite?: Decisao;
  limiteAnon?: Decisao;
  /** Simula o armazém de quotas a contar de verdade: p_limit por (operação, sujeito). */
  quotaReal?: boolean;
  /** O armazém falha só para o balde anónimo (o helper responde 503). */
  anonIndisponivel?: boolean;
  tarifa?: string | null;
  tarifaTvde?: string | null;
  rebentar?: boolean;
  /** O que api_cotacao devolve. */
  cotacao?: unknown;
  /** O que api_criar_reserva devolve. */
  reserva?: unknown;
}

function dbFalso(o: Opcoes = {}) {
  const pedidos: Record<string, unknown>[] = [];
  const rpcs: { name: string; args: Record<string, unknown> }[] = [];
  const usados = new Map<string, number>();
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
        const anon = args.p_operation === 'api-rent-a-car-anon';
        if (anon && o.anonIndisponivel) {
          return Promise.resolve({ data: null, error: { message: 'quotas offline' } });
        }
        if (o.quotaReal) {
          const k = `${args.p_operation}:${args.p_subject_hash}`;
          const n = usados.get(k) ?? 0;
          const allowed = n < Number(args.p_limit);
          if (allowed) usados.set(k, n + 1);
          return Promise.resolve({ data: { allowed, retry_after: allowed ? 0 : 60 }, error: null });
        }
        const decisao = (anon ? o.limiteAnon : o.limite) ?? { allowed: true, retry_after: 0 };
        return Promise.resolve({ data: decisao, error: null });
      }
      if (name === 'api_tarifa_site')
        return Promise.resolve({ data: o.tarifa ?? null, error: null });
      if (name === 'api_tarifa_site_tvde')
        return Promise.resolve({ data: o.tarifaTvde ?? null, error: null });
      if (name === 'api_tvde_modelos')
        return Promise.resolve({ data: [{ id: UUID }], error: null });
      if (name === 'api_cotacao') return Promise.resolve({ data: o.cotacao ?? null, error: null });
      if (name === 'api_criar_reserva') {
        return Promise.resolve({ data: o.reserva ?? null, error: null });
      }
      if (name === 'api_modelos') {
        if (o.rebentar) throw new Error('base em baixo');
        return Promise.resolve({ data: [{ id: UUID }], error: null });
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

const opsLimite = (db: ReturnType<typeof dbFalso>) =>
  db.rpcs.filter((c) => c.name === 'consume_edge_rate_limit').map((c) => c.args.p_operation);

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
  // Chave conhecida mas recusada: não gasta quota nenhuma (nem a anónima).
  assertEquals(opsLimite(db), []);
});

Deno.test(
  '429 do limite da chave fica em api_pedidos com org e chave, e traz Retry-After',
  async () => {
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
  }
);

Deno.test(
  'chave inventada gasta o balde anónimo por IP (60/min); o 429 fica auditado com nulos',
  async () => {
    const db = dbFalso({ chave: null, limiteAnon: { allowed: false, retry_after: 7 } });
    const r = await correr(pedido('/v1/modelos'), db);
    assertEquals(r.status, 429);
    assertEquals(r.headers.get('retry-after'), '7');
    assertEquals(
      db.rpcs.map((c) => c.name),
      ['api_chave_por_hash', 'consume_edge_rate_limit']
    );
    const anon = db.rpcs[1].args;
    assertEquals(anon.p_operation, 'api-rent-a-car-anon');
    assertEquals(anon.p_limit, 60);
    assertEquals(anon.p_window_seconds, 60);
    assertMatch(String(anon.p_subject_hash), /^[a-f0-9]{64}$/);
    assertEquals(db.pedidos.length, 1);
    assertEquals(db.pedidos[0].org_id, null);
    assertEquals(db.pedidos[0].api_chave_id, null);
    assertEquals(db.pedidos[0].estado_http, 429);
  }
);

Deno.test(
  '61 pedidos do mesmo IP com chave válida → todos 200 (atrás da Vercel o IP é partilhado)',
  async () => {
    const db = dbFalso({ quotaReal: true });
    for (let i = 0; i < 61; i++) {
      const r = await correr(pedido('/v1/health'), db);
      assertEquals(r.status, 200, `pedido ${i + 1}`);
      await r.body?.cancel();
    }
    assertEquals(opsLimite(db).includes('api-rent-a-car-anon'), false);
  }
);

Deno.test('61 pedidos do mesmo IP com chave inventada → 401 até ao 60.º, 429 no 61.º', async () => {
  const db = dbFalso({ chave: null, quotaReal: true });
  for (let i = 1; i <= 61; i++) {
    const r = await correr(pedido('/v1/modelos'), db);
    assertEquals(r.status, i <= 60 ? 401 : 429, `pedido ${i}`);
    await r.body?.cancel();
  }
});

Deno.test(
  'armazém do balde anónimo em baixo (503) não toca na chave válida nem no 401',
  async () => {
    const valida = await correr(pedido('/v1/health'), dbFalso({ anonIndisponivel: true }));
    assertEquals(valida.status, 200);
    const inventada = await correr(
      pedido('/v1/modelos'),
      dbFalso({ chave: null, anonIndisponivel: true })
    );
    assertEquals(inventada.status, 401);
  }
);

Deno.test('pedido bom: chave → limite da chave → catálogo, e auditoria com 200', async () => {
  const db = dbFalso();
  const r = await correr(pedido(`/api-rent-a-car/v1/modelos?categoria=${UUID}`), db);
  assertEquals(r.status, 200);
  assertEquals(await r.json(), [{ id: UUID }]);
  assertEquals(
    db.rpcs.map((c) => c.name),
    ['api_chave_por_hash', 'consume_edge_rate_limit', 'api_modelos']
  );
  assertEquals(opsLimite(db), ['api-rent-a-car']);
  const limite = db.rpcs.find((c) => c.args.p_operation === 'api-rent-a-car');
  assertEquals(limite?.args.p_limit, 120);
  assertEquals(limite?.args.p_window_seconds, 60);
  assertEquals(db.pedidos[0].estado_http, 200);
  assertEquals(db.pedidos[0].caminho, '/api-rent-a-car/v1/modelos');
});

Deno.test('limite da chave fica preso a 1..10000', async () => {
  for (const [configurado, aplicado] of [
    [0, 1],
    [50000, 10000],
  ] as const) {
    const db = dbFalso({ chave: { ...linhaOk, rate_limit_per_minute: configurado } });
    await correr(pedido('/v1/health'), db);
    assertEquals(
      db.rpcs.find((c) => c.args.p_operation === 'api-rent-a-car')?.args.p_limit,
      aplicado
    );
  }
});

Deno.test('/health diz se há tarifa do site, de rent-a-car e TVDE', async () => {
  const r = await correr(pedido('/v1/health'), dbFalso({ tarifa: 't1' }));
  assertEquals(await r.json(), {
    ok: true,
    organizacao: 'org1',
    permissoes: ['catalogo:read'],
    tarifa_site: true,
    tarifa_site_tvde: false,
  });
  const soTvde = await correr(pedido('/v1/health'), dbFalso({ tarifaTvde: 't2' }));
  const corpo = await soTvde.json();
  assertEquals([corpo.tarifa_site, corpo.tarifa_site_tvde], [false, true]);
});

Deno.test(
  'openapi.json (cache pública), OPTIONS e rota fora de /v1 não autenticam nem auditam',
  async () => {
    const db = dbFalso();
    const spec = await correr(new Request('https://x/v1/openapi.json'), db);
    assertEquals(spec.status, 200);
    assertEquals((await spec.json()).openapi, '3.1.0');
    assertEquals(spec.headers.get('cache-control'), 'public, max-age=3600');
    const opts = await correr(new Request('https://x/v1/modelos', { method: 'OPTIONS' }), db);
    assertEquals(opts.status, 200);
    assertEquals(opts.headers.get('access-control-allow-methods')?.includes('GET'), true);
    assertEquals(opts.headers.get('vary'), 'Origin');
    const fora = await correr(new Request('https://x/v2/modelos'), db);
    assertEquals(fora.status, 404);
    assertEquals(db.pedidos, []);
    assertEquals(db.rpcs, []);
  }
);

Deno.test(
  'CORS: devolve o ACAO da origem permitida; origem estranha não recebe nenhum',
  async () => {
    const db = dbFalso();
    for (const origem of ['https://wegest.pt', 'https://www.wegest.pt']) {
      const r = await correr(pedido('/v1/modelos', { origin: origem }), db);
      assertEquals(r.headers.get('access-control-allow-origin'), origem);
      const opts = await correr(
        new Request('https://x/v1/modelos', { method: 'OPTIONS', headers: { origin: origem } }),
        db
      );
      assertEquals(opts.headers.get('access-control-allow-origin'), origem);
    }
    const estranha = await correr(pedido('/v1/modelos', { origin: 'https://evil.example' }), db);
    assertEquals(estranha.headers.get('access-control-allow-origin'), null);
    const recusa = await correr(
      new Request('https://x/v1/modelos', { headers: { origin: 'https://wegest.pt' } }),
      db
    );
    assertEquals(recusa.status, 401);
    assertEquals(recusa.headers.get('access-control-allow-origin'), 'https://wegest.pt');
  }
);

Deno.test('recurso desconhecido em /v1 → 404 auditado, sem ecoar o nome pedido', async () => {
  const db = dbFalso();
  const r = await correr(pedido('/v1/reservas'), db);
  assertEquals(r.status, 404);
  assertEquals(await r.json(), {
    erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Recurso inexistente.' },
  });
  assertEquals(db.pedidos[0].estado_http, 404);
});

Deno.test('o caminho auditado é cortado a 200 caracteres e nunca leva a query string', async () => {
  const db = dbFalso();
  const longo = '/v1/modelos/' + 'a'.repeat(400);
  await correr(pedido(`${longo}?segredo=1`), db);
  const caminho = db.pedidos[0].caminho as string;
  assertEquals(caminho.length, 200);
  assertEquals(caminho.startsWith('/v1/modelos/aaaa'), true);
  assertEquals(caminho.includes('segredo'), false);
});

Deno.test('excepção inesperada → 500 ERRO_INTERNO auditado', async () => {
  const db = dbFalso({ rebentar: true });
  const r = await correr(pedido('/v1/modelos'), db);
  assertEquals(r.status, 500);
  assertEquals((await r.json()).erro.codigo, 'ERRO_INTERNO');
  assertEquals(db.pedidos[0].estado_http, 500);
});

Deno.test('GET /v1 (sem recurso) apresenta a API sem chave e sem auditoria', async () => {
  for (const caminho of ['/v1', '/v1/', '/api-rent-a-car/v1', '/api-rent-a-car/v1/']) {
    const db = dbFalso();
    const r = await correr(new Request(`https://x${caminho}`), db);
    assertEquals(r.status, 200, caminho);
    assertEquals(await r.json(), {
      nome: 'WeGest — API Rent-a-Car',
      versao: '1.0.0',
      documentacao: 'https://docs.wegest.pt',
    });
    assertEquals(db.rpcs, []);
    assertEquals(db.pedidos, []);
  }
});

Deno.test('POST /v1 continua a ser rota inexistente', async () => {
  const r = await correr(new Request('https://x/v1', { method: 'POST' }), dbFalso());
  assertEquals(r.status, 404);
});

Deno.test('POST /v1/cotacoes chega a servirDisponibilidade e é auditado', async () => {
  const db = dbFalso({
    chave: { ...linhaOk, permissoes: ['catalogo:read', 'disponibilidade:read'] },
    cotacao: { erro: { codigo: 'SEM_DISPONIBILIDADE', mensagem: 'Sem viaturas livres.' } },
  });
  const req = new Request('https://x/v1/cotacoes', {
    method: 'POST',
    headers: {
      'x-api-key': CHAVE,
      'cf-connecting-ip': '203.0.113.9',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      modelo_id: UUID,
      inicio: '2026-10-20T10:00:00+01:00',
      fim: '2026-10-23T10:00:00+01:00',
      entrega: UUID,
      recolha: UUID,
      extras: [],
    }),
  });
  const r = await correr(req, db);
  assertEquals(r.status, 409);
  assertEquals((await r.json()).erro.codigo, 'SEM_DISPONIBILIDADE');
  assertEquals(
    db.rpcs.map((c) => c.name),
    ['api_chave_por_hash', 'consume_edge_rate_limit', 'api_cotacao']
  );
  assertEquals(db.rpcs[2].args.p_org_id, 'org1');
  assertEquals(db.pedidos.length, 1);
  assertEquals(db.pedidos[0].metodo, 'POST');
  assertEquals(db.pedidos[0].caminho, '/v1/cotacoes');
  assertEquals(db.pedidos[0].estado_http, 409);
});

Deno.test('POST /v1/reservas chega a servirReservas, cria (201) e é auditado', async () => {
  const db = dbFalso({
    chave: { ...linhaOk, permissoes: ['reservas:write'] },
    reserva: { id: 'r1', codigo: 7, estado: 'pendente' },
  });
  const req = new Request('https://x/v1/reservas', {
    method: 'POST',
    headers: {
      'x-api-key': CHAVE,
      'cf-connecting-ip': '203.0.113.9',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      modelo_id: UUID,
      inicio: '2026-10-20T10:00:00+01:00',
      fim: '2026-10-23T10:00:00+01:00',
      entrega: UUID,
      recolha: UUID,
      extras: [],
      cliente: {
        nome: 'Carla Nova',
        email: 'Carla@Novo.pt',
        telefone: '+351 912 345 678',
        data_nascimento: '1990-05-01',
        pais: 'Portugal',
      },
      carta_conducao: { numero: 'L-123', validade: '2030-01-01', pais: 'Portugal' },
      total_esperado: 129.15,
      referencia_externa: 'site-001',
    }),
  });
  const r = await correr(req, db);
  assertEquals(r.status, 201);
  assertEquals((await r.json()).codigo, 7);
  assertEquals(
    db.rpcs.map((c) => c.name),
    ['api_chave_por_hash', 'consume_edge_rate_limit', 'api_criar_reserva']
  );
  assertEquals(db.rpcs[2].args.p_api_chave_id, 'k1');
  assertEquals(db.pedidos.length, 1);
  assertEquals(db.pedidos[0].caminho, '/v1/reservas');
  assertEquals(db.pedidos[0].estado_http, 201);
});

Deno.test('GET /v1/disponibilidade com chave só de catálogo → 403 auditado', async () => {
  const db = dbFalso();
  const r = await correr(
    pedido(
      `/v1/disponibilidade?inicio=2026-10-20T10:00:00Z&fim=2026-10-23T10:00:00Z&entrega=${UUID}&recolha=${UUID}`
    ),
    db
  );
  assertEquals(r.status, 403);
  assertEquals((await r.json()).erro.codigo, 'SEM_PERMISSAO');
  assertEquals(db.pedidos[0].estado_http, 403);
});

Deno.test('chave só com catalogo:read em /v1/tvde/modelos → 403 auditado', async () => {
  const db = dbFalso();
  const r = await correr(pedido('/v1/tvde/modelos'), db);
  assertEquals(r.status, 403);
  assertEquals((await r.json()).erro.codigo, 'SEM_PERMISSAO');
  assertEquals(db.pedidos[0].estado_http, 403);
  assertEquals(
    db.rpcs.some((c) => c.name.startsWith('api_tvde') || c.name === 'api_modelos'),
    false
  );
});

Deno.test('chave só com tvde:catalogo:read em /v1/modelos (rent-a-car) → 403', async () => {
  const db = dbFalso({ chave: { ...linhaOk, permissoes: ['tvde:catalogo:read'] } });
  const r = await correr(pedido('/v1/modelos'), db);
  assertEquals(r.status, 403);
  assertEquals((await r.json()).erro.codigo, 'SEM_PERMISSAO');
  assertEquals(
    db.rpcs.some((c) => c.name === 'api_modelos'),
    false
  );
});

Deno.test('GET /v1/tvde/modelos com a permissão chega a api_tvde_modelos', async () => {
  const db = dbFalso({ chave: { ...linhaOk, permissoes: ['tvde:catalogo:read'] } });
  const r = await correr(pedido('/api-rent-a-car/v1/tvde/modelos'), db);
  assertEquals(r.status, 200);
  assertEquals(await r.json(), [{ id: UUID }]);
  assertEquals(
    db.rpcs.map((c) => c.name),
    ['api_chave_por_hash', 'consume_edge_rate_limit', 'api_tvde_modelos']
  );
  assertEquals(db.pedidos[0].caminho, '/api-rent-a-car/v1/tvde/modelos');
});

Deno.test('/v1/tvde, /v1/tvde/xyz e /v1/tvdemodelos → 404', async () => {
  for (const caminho of ['/v1/tvde', '/v1/tvde/xyz', '/v1/tvdemodelos', '/v1/tvde/tvde/modelos']) {
    const db = dbFalso({ chave: { ...linhaOk, permissoes: ['tvde:catalogo:read'] } });
    const r = await correr(pedido(caminho), db);
    assertEquals(r.status, 404, caminho);
    assertEquals((await r.json()).erro.codigo, 'NAO_ENCONTRADO');
  }
});
