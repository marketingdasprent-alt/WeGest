import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { lerDataComFuso, servirDisponibilidade, validarCorpoCotacao } from './disponibilidade.ts';

const ctx = {
  chaveId: 'k1',
  orgId: 'org1',
  permissoes: ['disponibilidade:read'],
  limitePorMinuto: 120,
};
const E = '00000000-0000-0000-0000-000000000301';
const M = '00000000-0000-0000-0000-000000000d01';
const X = '00000000-0000-0000-0000-000000000401';
const semBase = {
  rpc(): never {
    throw new Error('não devia chamar a base');
  },
};
const base = (esperado: string, data: unknown) => ({
  rpc(nome: string, args: Record<string, unknown>) {
    assertEquals(nome, esperado);
    assertEquals(args.p_org_id, 'org1');
    return Promise.resolve({ data, error: null });
  },
});

Deno.test('datas só com fuso explícito', () => {
  assertEquals(
    lerDataComFuso('2026-10-10T10:00:00+01:00')?.toISOString(),
    '2026-10-10T09:00:00.000Z'
  );
  assertEquals(lerDataComFuso('2026-10-10T09:00:00Z')?.toISOString(), '2026-10-10T09:00:00.000Z');
  assertEquals(lerDataComFuso('2026-10-10T10:00'), null);
  assertEquals(lerDataComFuso('ontem'), null);
  assertEquals(lerDataComFuso(null), null);
});

Deno.test('GET /disponibilidade sem fuso → 400 sem ir à base', async () => {
  const url = new URL(
    `https://x/v1/disponibilidade?inicio=2026-10-10T10:00&fim=2026-10-12T10:00Z&entrega=${E}&recolha=${E}`
  );
  const r = await servirDisponibilidade(
    { metodo: 'GET', recurso: 'disponibilidade', id: null },
    url,
    new Request(url),
    ctx,
    semBase
  );
  assertEquals(r?.status, 400);
  assertEquals((await r!.json()).erro.codigo, 'PARAMETRO_INVALIDO');
});

Deno.test('GET /disponibilidade válido chama api_disponibilidade e não guarda cache', async () => {
  const url = new URL(
    `https://x/v1/disponibilidade?inicio=2026-10-10T10:00:00Z&fim=2026-10-12T10:00:00Z&entrega=${E}&recolha=${E}&tipo=passageiros`
  );
  const r = await servirDisponibilidade(
    { metodo: 'GET', recurso: 'disponibilidade', id: null },
    url,
    new Request(url),
    ctx,
    base('api_disponibilidade', { periodo: { dias: 2 }, modelos: [] })
  );
  assertEquals(r?.status, 200);
  assertEquals(r?.headers.get('cache-control'), 'no-store');
});

Deno.test('erro de negócio da base vira o HTTP certo', async () => {
  const url = new URL(
    `https://x/v1/disponibilidade?inicio=2026-10-10T10:00:00Z&fim=2026-11-12T10:00:00Z&entrega=${E}&recolha=${E}`
  );
  const r = await servirDisponibilidade(
    { metodo: 'GET', recurso: 'disponibilidade', id: null },
    url,
    new Request(url),
    ctx,
    base('api_disponibilidade', {
      erro: { codigo: 'PERIODO_EXCEDE_MAXIMO', mensagem: 'Máximo de 30 dias.' },
    })
  );
  assertEquals(r?.status, 400);
  assertEquals((await r!.json()).erro.codigo, 'PERIODO_EXCEDE_MAXIMO');
});

Deno.test('SEM_DISPONIBILIDADE → 409, CONFIG_EM_FALTA → 503', async () => {
  const pedir = (codigo: string) => {
    const req = new Request('https://x/v1/cotacoes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        modelo_id: M,
        inicio: '2026-10-10T10:00:00Z',
        fim: '2026-10-12T10:00:00Z',
        entrega: E,
        recolha: E,
        extras: [],
      }),
    });
    return servirDisponibilidade(
      { metodo: 'POST', recurso: 'cotacoes', id: null },
      new URL(req.url),
      req,
      ctx,
      base('api_cotacao', { erro: { codigo, mensagem: 'x' } })
    );
  };
  assertEquals((await pedir('SEM_DISPONIBILIDADE'))?.status, 409);
  assertEquals((await pedir('CONFIG_EM_FALTA'))?.status, 503);
});

Deno.test('POST /cotacoes manda as datas em UTC, os extras e a cobertura à base', async () => {
  const C = '00000000-0000-0000-0000-000000000501';
  let args: Record<string, unknown> = {};
  const req = new Request('https://x/v1/cotacoes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      modelo_id: M,
      inicio: '2026-10-10T10:00:00+01:00',
      fim: '2026-10-13T10:00:00+01:00',
      entrega: E,
      recolha: E,
      extras: [{ extra_id: X, quantidade: 2 }],
      cobertura_id: C,
    }),
  });
  const r = await servirDisponibilidade(
    { metodo: 'POST', recurso: 'cotacoes', id: null },
    new URL(req.url),
    req,
    ctx,
    {
      rpc(nome: string, a: Record<string, unknown>) {
        assertEquals(nome, 'api_cotacao');
        args = a;
        return Promise.resolve({ data: { linhas: [] }, error: null });
      },
    }
  );
  assertEquals(r?.status, 200);
  assertEquals(r?.headers.get('cache-control'), 'no-store');
  assertEquals(args.p_inicio, '2026-10-10T09:00:00.000Z');
  assertEquals(args.p_fim, '2026-10-13T09:00:00.000Z');
  assertEquals(args.p_extras, [{ extra_id: X, quantidade: 2 }]);
  assertEquals(args.p_cobertura_id, C);
});

Deno.test('POST /cotacoes com JSON inválido → 400 CORPO_INVALIDO sem ir à base', async () => {
  const req = new Request('https://x/v1/cotacoes', { method: 'POST', body: '{nao é json' });
  const r = await servirDisponibilidade(
    { metodo: 'POST', recurso: 'cotacoes', id: null },
    new URL(req.url),
    req,
    ctx,
    semBase
  );
  assertEquals(r?.status, 400);
  assertEquals((await r!.json()).erro.codigo, 'CORPO_INVALIDO');
});

Deno.test('corpo da cotação: quantidades inválidas recusadas antes da base', () => {
  const corpo = {
    modelo_id: M,
    inicio: '2026-10-10T10:00:00Z',
    fim: '2026-10-12T10:00:00Z',
    entrega: E,
    recolha: E,
  };
  for (const q of [0, -1, 1.5, '2']) {
    assertEquals(
      validarCorpoCotacao({ ...corpo, extras: [{ extra_id: X, quantidade: q }] }).ok,
      false,
      `quantidade ${q}`
    );
  }
  assertEquals(validarCorpoCotacao({ ...corpo, extras: [] }).ok, true);
  assertEquals(validarCorpoCotacao({ ...corpo }).ok, true);
  assertEquals(validarCorpoCotacao({ ...corpo, modelo_id: 'zzz' }).ok, false);
  assertEquals(validarCorpoCotacao({ ...corpo, inicio: '2026-10-10T10:00' }).ok, false);
  assertEquals(validarCorpoCotacao({ ...corpo, extras: [null] }).ok, false);
  assertEquals(
    validarCorpoCotacao({
      ...corpo,
      extras: Array.from({ length: 21 }, () => ({ extra_id: X, quantidade: 1 })),
    }).ok,
    false
  );
});

Deno.test('sem permissão disponibilidade:read → 403', async () => {
  const url = new URL(
    `https://x/v1/disponibilidade?inicio=2026-10-10T10:00:00Z&fim=2026-10-12T10:00:00Z&entrega=${E}&recolha=${E}`
  );
  const r = await servirDisponibilidade(
    { metodo: 'GET', recurso: 'disponibilidade', id: null },
    url,
    new Request(url),
    { ...ctx, permissoes: ['catalogo:read'] },
    semBase
  );
  assertEquals(r?.status, 403);
});

Deno.test('método errado ou id no caminho → 404', async () => {
  const url = new URL('https://x/v1/cotacoes');
  const get = await servirDisponibilidade(
    { metodo: 'GET', recurso: 'cotacoes', id: null },
    url,
    new Request(url),
    ctx,
    semBase
  );
  assertEquals(get?.status, 404);
  const comId = await servirDisponibilidade(
    { metodo: 'GET', recurso: 'disponibilidade', id: 'abc' },
    url,
    new Request(url),
    ctx,
    semBase
  );
  assertEquals(comId?.status, 404);
});

Deno.test('erros também levam Cache-Control: no-store (409 da base, 400 local, 500)', async () => {
  const cotar = (db: Parameters<typeof servirDisponibilidade>[4], corpo: unknown) => {
    const req = new Request('https://x/v1/cotacoes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    return servirDisponibilidade(
      { metodo: 'POST', recurso: 'cotacoes', id: null },
      new URL(req.url),
      req,
      ctx,
      db
    );
  };
  const corpo = {
    modelo_id: M,
    inicio: '2026-10-10T10:00:00Z',
    fim: '2026-10-12T10:00:00Z',
    entrega: E,
    recolha: E,
  };
  const r409 = await cotar(
    base('api_cotacao', { erro: { codigo: 'SEM_DISPONIBILIDADE', mensagem: 'x' } }),
    corpo
  );
  assertEquals(r409?.status, 409);
  assertEquals(r409?.headers.get('cache-control'), 'no-store');
  const r400 = await cotar(semBase, { ...corpo, extras: [{ extra_id: X, quantidade: 0 }] });
  assertEquals(r400?.status, 400);
  assertEquals((await r400!.json()).erro.codigo, 'PARAMETRO_INVALIDO');
  assertEquals(r400?.headers.get('cache-control'), 'no-store');
  const r500 = await cotar(
    { rpc: () => Promise.resolve({ data: null, error: { message: 'base em baixo' } }) },
    corpo
  );
  assertEquals(r500?.status, 500);
  assertEquals(r500?.headers.get('cache-control'), 'no-store');
  const url = new URL('https://x/v1/disponibilidade?inicio=ontem');
  const r400get = await servirDisponibilidade(
    { metodo: 'GET', recurso: 'disponibilidade', id: null },
    url,
    new Request(url),
    ctx,
    semBase
  );
  assertEquals(r400get?.status, 400);
  assertEquals(r400get?.headers.get('cache-control'), 'no-store');
});

Deno.test('recurso de catálogo devolve null', async () => {
  const url = new URL('https://x/v1/modelos');
  assertEquals(
    await servirDisponibilidade(
      { metodo: 'GET', recurso: 'modelos', id: null },
      url,
      new Request(url),
      ctx,
      semBase
    ),
    null
  );
});

const armazem = {
  storage: {
    from: (_bucket: string) => ({
      createSignedUrls: (caminhos: string[], _validade: number) =>
        Promise.resolve({
          data: caminhos.map((p) => ({ path: p, signedUrl: `https://s/${p}?t=1`, error: null })),
          error: null,
        }),
    }),
  },
};

Deno.test('GET /disponibilidade: cartões com a foto assinada e sem foto_path', async () => {
  const url = new URL(
    `https://x/v1/disponibilidade?inicio=2026-10-10T10:00:00Z&fim=2026-10-12T10:00:00Z&entrega=${E}&recolha=${E}`
  );
  const r = await servirDisponibilidade(
    { metodo: 'GET', recurso: 'disponibilidade', id: null },
    url,
    new Request(url),
    ctx,
    {
      ...base('api_disponibilidade', {
        periodo: { dias: 2 },
        modelos: [
          { id: M, imagem_url: null, foto_path: 'v1/fotos/capa', quantidade_disponivel: 1 },
          { id: X, imagem_url: null, foto_path: null, quantidade_disponivel: 3 },
        ],
      }),
      ...armazem,
    }
  );
  assertEquals(await r?.json(), {
    periodo: { dias: 2 },
    modelos: [
      { id: M, imagem_url: 'https://s/v1/fotos/capa?t=1', quantidade_disponivel: 1 },
      { id: X, imagem_url: null, quantidade_disponivel: 3 },
    ],
  });
});
