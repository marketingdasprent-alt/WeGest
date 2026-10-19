import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { ArmazemDocumentos } from './armazemDocumentos.ts';
import { servirConta } from './conta.ts';
import { LIMITE_ENVIOS_POR_DIA, TAMANHO_MAXIMO_DOCUMENTO } from './contaCandidatura.ts';
import type { Rota } from './router.ts';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJh';
const USER_ID = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';
const OUTRO_USER = '11111111-2222-4333-8444-555555555555';
const FICHEIRO = '0b7e3c1a-5d2f-4a8b-9c6e-1f3a5b7d9e2c';
const ANTERIOR = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f';
const CAMINHO = `${USER_ID}/candidatura/carta_frente/${FICHEIRO}.jpg`;
const CAMINHO_ANTERIOR = `${USER_ID}/candidatura/carta_frente/${ANTERIOR}.png`;
const ctx = {
  chaveId: 'k1',
  orgId: 'org1',
  permissoes: ['conta:read', 'conta:write'],
  limitePorMinuto: 120,
};
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const PDF = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]);

type Resp = { data: unknown; error: unknown };
const SESSAO = { data: { user: { id: USER_ID } }, error: null };
const SEM_SESSAO = { data: { user: null }, error: { message: 'invalid JWT', status: 403 } };

function dbFalso(
  o: { rpcs?: Record<string, Resp>; limitePermitido?: boolean; sessao?: unknown } = {}
) {
  const chamadas: { name: string; args: Record<string, unknown> }[] = [];
  return {
    chamadas,
    auth: {
      getUser(jwt: string) {
        chamadas.push({ name: 'auth.getUser', args: { jwt } });
        return Promise.resolve((o.sessao ?? SESSAO) as typeof SESSAO);
      },
    },
    rpc(name: string, args: Record<string, unknown>) {
      chamadas.push({ name, args });
      if (name === 'consume_edge_rate_limit') {
        const permitido = o.limitePermitido ?? true;
        return Promise.resolve({
          data: { allowed: permitido, retry_after: permitido ? 0 : 3600 },
          error: null,
        });
      }
      return Promise.resolve(o.rpcs?.[name] ?? { data: { ok: name }, error: null });
    },
  };
}
const nomes = (db: ReturnType<typeof dbFalso>) => db.chamadas.map((c) => c.name);

function armazemFalso(
  o: {
    info?: Awaited<ReturnType<ArmazemDocumentos['info']>>;
    inicio?: Awaited<ReturnType<ArmazemDocumentos['inicio']>>;
    assinar?: Awaited<ReturnType<ArmazemDocumentos['assinarEnvio']>>;
    apagarOk?: boolean;
  } = {}
) {
  const apagados: string[] = [];
  const assinados: string[] = [];
  const armazem: ArmazemDocumentos = {
    assinarEnvio(c) {
      assinados.push(c);
      return Promise.resolve(
        o.assinar ?? {
          url: `https://s.exemplo/upload?token=t`,
          expiraEm: '2026-10-16T16:00:00.000Z',
        }
      );
    },
    info: () => Promise.resolve(o.info ?? { tamanho: 1000 }),
    inicio: () => Promise.resolve(o.inicio ?? { bytes: JPEG }),
    apagar(c) {
      apagados.push(c);
      return Promise.resolve(o.apagarOk ?? true);
    },
  };
  return { armazem, apagados, assinados };
}

const rota = (metodo: Rota['metodo'], recurso: string, id: string | null = null): Rota => ({
  metodo,
  recurso,
  id,
});
const rotaDoc = (metodo: Rota['metodo'], tipo = 'carta_frente') =>
  rota(metodo, 'conta/candidatura-documentos', tipo);
const pedido = (metodo: string, corpo?: unknown, cabecalhos: Record<string, string> = {}) =>
  new Request('https://x/v1/conta/candidatura', {
    method: metodo,
    headers: { 'x-conta-token': TOKEN, 'content-type': 'application/json', ...cabecalhos },
    body:
      corpo === undefined || metodo === 'GET'
        ? undefined
        : typeof corpo === 'string'
          ? corpo
          : JSON.stringify(corpo),
  });
const semPdf = () => Promise.resolve({ erro: 'x' });
const servir = (
  r: Rota,
  req: Request,
  db: ReturnType<typeof dbFalso>,
  armazem: ArmazemDocumentos | null,
  c = ctx
) => servirConta(r, req, c, db, semPdf, armazem);

// A RPC devolve a candidatura dentro de { candidatura }.
const RASCUNHO: Resp = { data: { candidatura: { id: 'c1', estado: 'rascunho' } }, error: null };

Deno.test('GET /conta/candidatura chama api_conta_candidatura, sem cache', async () => {
  const db = dbFalso({ rpcs: { api_conta_candidatura: RASCUNHO } });
  const r = await servir(rota('GET', 'conta/candidatura'), pedido('GET'), db, null);
  assertEquals(r?.status, 200);
  assertEquals(r?.headers.get('Cache-Control'), 'no-store');
  assertEquals(nomes(db), ['auth.getUser', 'api_conta_candidatura']);
  assertEquals(db.chamadas[1].args, { p_org_id: 'org1', p_user_id: USER_ID });
});

Deno.test('POST /conta/candidatura submete com org e user da sessão', async () => {
  const db = dbFalso();
  const r = await servir(rota('POST', 'conta/candidatura'), pedido('POST'), db, null);
  assertEquals(r?.status, 200);
  assertEquals(db.chamadas[1], {
    name: 'api_conta_candidatura_submeter',
    args: { p_org_id: 'org1', p_user_id: USER_ID },
  });
});

Deno.test('submeter: CANDIDATURA_INCOMPLETA → 422 com a lista em falta', async () => {
  const db = dbFalso({
    rpcs: {
      api_conta_candidatura_submeter: {
        data: {
          erro: {
            codigo: 'CANDIDATURA_INCOMPLETA',
            mensagem: 'Faltam dados.',
            em_falta: { campos: ['iban'], documentos: [] },
          },
        },
        error: null,
      },
    },
  });
  const r = await servir(rota('POST', 'conta/candidatura'), pedido('POST'), db, null);
  assertEquals(r?.status, 422);
  assertEquals((await r!.json()).erro.detalhes, { campos: ['iban'], documentos: [] });
});

Deno.test(
  'códigos do SQL: NAO_ENCONTRADO 404, NAO_EDITAVEL 409, EXISTENTE 409, PEDIDO_INVALIDO 422',
  async () => {
    const casos: [string, number][] = [
      ['NAO_ENCONTRADO', 404],
      ['CANDIDATURA_NAO_EDITAVEL', 409],
      ['CANDIDATURA_EXISTENTE', 409],
      ['PEDIDO_INVALIDO', 422],
    ];
    for (const [codigo, estado] of casos) {
      const db = dbFalso({
        rpcs: { api_conta_candidatura: { data: { erro: { codigo, mensagem: 'm' } }, error: null } },
      });
      const r = await servir(rota('GET', 'conta/candidatura'), pedido('GET'), db, null);
      assertEquals(r?.status, estado, codigo);
    }
  }
);

Deno.test('erro do Postgres → 500 e o log só leva a RPC e o código', async () => {
  const db = dbFalso({
    rpcs: {
      api_conta_candidatura: { data: null, error: { code: '42501', message: 'nif 258714638' } },
    },
  });
  const antes = console.error;
  const logs: unknown[][] = [];
  console.error = (...a: unknown[]) => logs.push(a);
  try {
    const r = await servir(rota('GET', 'conta/candidatura'), pedido('GET'), db, null);
    assertEquals(r?.status, 500);
  } finally {
    console.error = antes;
  }
  assert(!JSON.stringify(logs).includes('258714638'));
  assert(JSON.stringify(logs).includes('42501'));
});

Deno.test('sem token → 401, token inválido → 401, sem tocar na base', async () => {
  const casos: [Rota, string][] = [
    [rota('GET', 'conta/candidatura'), 'GET'],
    [rota('PUT', 'conta/candidatura'), 'PUT'],
    [rota('POST', 'conta/candidatura'), 'POST'],
    [rotaDoc('POST'), 'POST'],
    [rotaDoc('PUT'), 'PUT'],
    [rotaDoc('DELETE'), 'DELETE'],
  ];
  for (const [r, metodo] of casos) {
    const db = dbFalso();
    const sem = await servir(
      r,
      pedido(metodo, undefined, { 'x-conta-token': '' }),
      db,
      armazemFalso().armazem
    );
    assertEquals(sem?.status, 401, `${metodo} ${r.recurso}`);
    assertEquals(db.chamadas, []);
    const mau = await servir(
      r,
      pedido(metodo, '{}', { 'x-conta-token': 'isto-nao-e-jwt' }),
      db,
      null
    );
    assertEquals(mau?.status, 401);
    assertEquals(db.chamadas, []);
  }
  const db = dbFalso({ sessao: SEM_SESSAO });
  const r = await servir(rota('GET', 'conta/candidatura'), pedido('GET'), db, null);
  assertEquals(r?.status, 401);
  assertEquals(nomes(db), ['auth.getUser']);
});

Deno.test(
  'permissão em falta → 403: leitura precisa de conta:read, o resto de conta:write',
  async () => {
    const soLeitura = { ...ctx, permissoes: ['conta:read'] };
    const soEscrita = { ...ctx, permissoes: ['conta:write'] };
    const { armazem } = armazemFalso();
    for (const [r, metodo] of [
      [rota('PUT', 'conta/candidatura'), 'PUT'],
      [rota('POST', 'conta/candidatura'), 'POST'],
      [rotaDoc('POST'), 'POST'],
      [rotaDoc('PUT'), 'PUT'],
      [rotaDoc('DELETE'), 'DELETE'],
    ] as const) {
      const db = dbFalso();
      const x = await servir(r, pedido(metodo, '{}'), db, armazem, soLeitura);
      assertEquals(x?.status, 403, `${metodo} ${r.recurso}`);
      assertEquals(db.chamadas, []);
    }
    const db = dbFalso();
    const g = await servir(rota('GET', 'conta/candidatura'), pedido('GET'), db, armazem, soEscrita);
    assertEquals(g?.status, 403);
    assertEquals(db.chamadas, []);
  }
);

Deno.test(
  'PUT /conta/candidatura grava só o rascunho validado, com a chave e o user da sessão',
  async () => {
    const db = dbFalso({ rpcs: { api_conta_candidatura_guardar: RASCUNHO } });
    const r = await servir(
      rota('PUT', 'conta/candidatura'),
      pedido('PUT', { nome: '  Rui  ', nif: '258 714 638', observacoes: null }),
      db,
      null
    );
    assertEquals(r?.status, 200);
    assertEquals(db.chamadas[1], {
      name: 'api_conta_candidatura_guardar',
      args: {
        p_org_id: 'org1',
        p_user_id: USER_ID,
        p_api_chave_id: 'k1',
        p_pedido: { nome: 'Rui', nif: '258714638', observacoes: null },
      },
    });
  }
);

Deno.test(
  'PUT /conta/candidatura recusa campos desconhecidos, ficheiros e formatos maus',
  async () => {
    const maus: unknown[] = [
      {},
      [],
      { user_id: USER_ID },
      { status: 'aprovado' },
      { estado: 'aprovado' },
      { referencia_externa: 'x' },
      { carta_frente: 'x.jpg' },
      { documento: { tipo: 'cc', ficheiro: 'x' } },
      { nif: '12' },
      { email: 'sem-arroba' },
      { nome: null },
      { iban: 'xx' },
      { consentimento: { versao: '1', aceite_em: '2020-01-01T00:00:00' } },
      { constructor: 1 },
    ];
    for (const corpo of maus) {
      const db = dbFalso();
      const r = await servir(rota('PUT', 'conta/candidatura'), pedido('PUT', corpo), db, null);
      assertEquals(r?.status, 400, JSON.stringify(corpo));
      assertEquals(nomes(db), ['auth.getUser']);
    }
    const db = dbFalso();
    const r = await servir(rota('PUT', 'conta/candidatura'), pedido('PUT', '{nao json'), db, null);
    assertEquals(r?.status, 400);
    assertEquals((await r!.json()).erro.codigo, 'CORPO_INVALIDO');
  }
);

Deno.test('GET/POST/PUT /conta/candidatura com id, ou DELETE sem id → 404', async () => {
  const db = dbFalso();
  for (const r of [
    rota('GET', 'conta/candidatura', 'x'),
    rota('DELETE', 'conta/candidatura'),
    rota('GET', 'conta/candidatura-documentos', 'carta_frente'),
    rota('POST', 'conta/candidatura-documentos'),
  ]) {
    const x = await servir(r, pedido(r.metodo), db, armazemFalso().armazem);
    assertEquals(x?.status, 404);
  }
  assertEquals(db.chamadas, []);
});

Deno.test('tipo de documento inválido → 400 sem ir ao GoTrue nem à base', async () => {
  for (const metodo of ['POST', 'PUT', 'DELETE'] as const) {
    const db = dbFalso();
    const r = await servir(
      rotaDoc(metodo, 'selfie'),
      pedido(metodo, { content_type: 'image/png', tamanho: 5 }),
      db,
      armazemFalso().armazem
    );
    assertEquals(r?.status, 400, metodo);
    assertEquals(db.chamadas, []);
  }
});

Deno.test('sem storage configurado → 503 nas rotas de documentos', async () => {
  const db = dbFalso();
  const r = await servir(
    rotaDoc('POST'),
    pedido('POST', { content_type: 'image/png', tamanho: 5 }),
    db,
    null
  );
  assertEquals(r?.status, 503);
});

// --- pedir envio ---------------------------------------------------------

const PEDIDO_ENVIO = { content_type: 'image/jpeg', tamanho: 1843200 };

Deno.test('pedir envio: rascunho existente → URL assinado e caminho da própria conta', async () => {
  const db = dbFalso({ rpcs: { api_conta_candidatura: RASCUNHO } });
  const { armazem, assinados } = armazemFalso();
  const r = await servir(rotaDoc('POST'), pedido('POST', PEDIDO_ENVIO), db, armazem);
  assertEquals(r?.status, 200);
  assertEquals(r?.headers.get('Cache-Control'), 'no-store');
  const corpo = await r!.json();
  assertEquals(corpo.metodo, 'PUT');
  assertEquals(corpo.cabecalhos, { 'Content-Type': 'image/jpeg' });
  assertEquals(corpo.expira_em, '2026-10-16T16:00:00.000Z');
  assert(corpo.upload_url.startsWith('https://s.exemplo/'));
  assert(
    new RegExp(`^${USER_ID}/candidatura/carta_frente/[0-9a-f-]{36}\\.jpg$`).test(corpo.caminho),
    corpo.caminho
  );
  assertEquals(assinados, [corpo.caminho]);
  assertEquals(nomes(db), ['auth.getUser', 'consume_edge_rate_limit', 'api_conta_candidatura']);
});

Deno.test('pedir envio: a extensão vem do content_type', async () => {
  for (const [mime, ext] of [
    ['application/pdf', 'pdf'],
    ['image/png', 'png'],
  ]) {
    const db = dbFalso({ rpcs: { api_conta_candidatura: RASCUNHO } });
    const r = await servir(
      rotaDoc('POST', 'registo_criminal'),
      pedido('POST', { content_type: mime, tamanho: 10 }),
      db,
      armazemFalso().armazem
    );
    assert((await r!.json()).caminho.endsWith(`.${ext}`));
  }
});

Deno.test(
  'pedir envio: tamanho e content_type inválidos → 400 sem tocar na base nem no storage',
  async () => {
    const maus = [
      { content_type: 'image/gif', tamanho: 10 },
      { content_type: 'text/html', tamanho: 10 },
      { content_type: 'image/png', tamanho: TAMANHO_MAXIMO_DOCUMENTO + 1 },
      { content_type: 'image/png', tamanho: 0 },
      { content_type: 'image/png', tamanho: 1.5 },
      { content_type: 'image/png', tamanho: '10' },
      { content_type: 'image/png' },
      { content_type: 'image/png', tamanho: 10, extra: 1 },
      { tamanho: 10 },
      [],
    ];
    for (const corpo of maus) {
      const db = dbFalso();
      const { armazem, assinados } = armazemFalso();
      const r = await servir(rotaDoc('POST'), pedido('POST', corpo), db, armazem);
      assertEquals(r?.status, 400, JSON.stringify(corpo));
      assertEquals(nomes(db), ['auth.getUser']);
      assertEquals(assinados, []);
    }
    const db = dbFalso({ rpcs: { api_conta_candidatura: RASCUNHO } });
    const r = await servir(
      rotaDoc('POST'),
      pedido('POST', { content_type: 'image/png', tamanho: TAMANHO_MAXIMO_DOCUMENTO }),
      db,
      armazemFalso().armazem
    );
    assertEquals(r?.status, 200);
  }
);

Deno.test('pedir envio: sem candidatura → 404; submetida → 409; sem assinar nada', async () => {
  const casos: [Resp, number, string][] = [
    [{ data: null, error: null }, 404, 'NAO_ENCONTRADO'],
    [
      { data: { erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'm' } }, error: null },
      404,
      'NAO_ENCONTRADO',
    ],
    [
      { data: { candidatura: { id: 'c1', estado: 'submetido' } }, error: null },
      409,
      'CANDIDATURA_NAO_EDITAVEL',
    ],
  ];
  for (const [resp, estado, codigo] of casos) {
    const db = dbFalso({ rpcs: { api_conta_candidatura: resp } });
    const { armazem, assinados } = armazemFalso();
    const r = await servir(rotaDoc('POST'), pedido('POST', PEDIDO_ENVIO), db, armazem);
    assertEquals(r?.status, estado);
    assertEquals((await r!.json()).erro.codigo, codigo);
    assertEquals(assinados, []);
  }
});

Deno.test('pedir envio: limite diário por conta → 429 com Retry-After, sem assinar', async () => {
  const db = dbFalso({ limitePermitido: false });
  const { armazem, assinados } = armazemFalso();
  const r = await servir(rotaDoc('POST'), pedido('POST', PEDIDO_ENVIO), db, armazem);
  assertEquals(r?.status, 429);
  assertEquals(r?.headers.get('Retry-After'), '3600');
  assertEquals(assinados, []);
  const limite = db.chamadas.find((c) => c.name === 'consume_edge_rate_limit')!;
  assertEquals(limite.args.p_operation, 'api-rent-a-car-conta-doc-envio');
  assert(!JSON.stringify(limite.args).includes(USER_ID), 'a identidade vai em hash');
  assertEquals(limite.args.p_limit, LIMITE_ENVIOS_POR_DIA);
  assertEquals(limite.args.p_window_seconds, 86400);
});

Deno.test('pedir envio: storage que falha → 503', async () => {
  const db = dbFalso({ rpcs: { api_conta_candidatura: RASCUNHO } });
  const { armazem } = armazemFalso({ assinar: { erro: 'StorageError:500' } });
  const r = await servir(rotaDoc('POST'), pedido('POST', PEDIDO_ENVIO), db, armazem);
  assertEquals(r?.status, 503);
});

// --- confirmar -----------------------------------------------------------

const confirmar = (caminho: unknown, resp?: Resp) => ({
  db: dbFalso({ rpcs: resp ? { api_conta_candidatura_documento: resp } : {} }),
  req: pedido('PUT', { caminho }),
});

Deno.test(
  'confirmar: objecto válido → RPC com tipo e caminho; resposta sem caminhos internos',
  async () => {
    const { db, req } = confirmar(CAMINHO, {
      data: { id: 'c1', estado: 'rascunho', caminho_removido: null },
      error: null,
    });
    const { armazem, apagados } = armazemFalso();
    const r = await servir(rotaDoc('PUT'), req, db, armazem);
    assertEquals(r?.status, 200);
    assertEquals(await r!.json(), { id: 'c1', estado: 'rascunho' });
    assertEquals(db.chamadas[1], {
      name: 'api_conta_candidatura_documento',
      args: { p_org_id: 'org1', p_user_id: USER_ID, p_tipo: 'carta_frente', p_caminho: CAMINHO },
    });
    assertEquals(apagados, []);
  }
);

Deno.test('confirmar: PDF e PNG pelos bytes, cada um com a sua extensão', async () => {
  for (const [bytes, ext] of [
    [PDF, 'pdf'],
    [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'png'],
  ] as const) {
    const caminho = `${USER_ID}/candidatura/carta_frente/${FICHEIRO}.${ext}`;
    const { db, req } = confirmar(caminho);
    const r = await servir(rotaDoc('PUT'), req, db, armazemFalso({ inicio: { bytes } }).armazem);
    assertEquals(r?.status, 200, ext);
  }
});

Deno.test('confirmar: substitui o ficheiro anterior e apaga-o do storage', async () => {
  const { db, req } = confirmar(CAMINHO, {
    data: { id: 'c1', caminho_removido: CAMINHO_ANTERIOR },
    error: null,
  });
  const { armazem, apagados } = armazemFalso();
  const r = await servir(rotaDoc('PUT'), req, db, armazem);
  assertEquals(r?.status, 200);
  assertEquals(apagados, [CAMINHO_ANTERIOR]);
  assert(!JSON.stringify(await r!.json()).includes(ANTERIOR));
});

Deno.test(
  'confirmar: falha a apagar o anterior não derruba a resposta e o log não leva o caminho',
  async () => {
    const { db, req } = confirmar(CAMINHO, {
      data: { id: 'c1', caminho_anterior: CAMINHO_ANTERIOR },
      error: null,
    });
    const { armazem, apagados } = armazemFalso({ apagarOk: false });
    const antes = console.error;
    const logs: unknown[][] = [];
    console.error = (...a: unknown[]) => logs.push(a);
    try {
      const r = await servir(rotaDoc('PUT'), req, db, armazem);
      assertEquals(r?.status, 200);
    } finally {
      console.error = antes;
    }
    assertEquals(apagados, [CAMINHO_ANTERIOR]);
    assertEquals(logs.length, 1);
    assert(!JSON.stringify(logs).includes(USER_ID));
  }
);

Deno.test('confirmar: o anterior que não é desta conta nunca se apaga', async () => {
  const { db, req } = confirmar(CAMINHO, {
    data: { caminho_removido: `${OUTRO_USER}/candidatura/carta_frente/${ANTERIOR}.png` },
    error: null,
  });
  const { armazem, apagados } = armazemFalso();
  assertEquals((await servir(rotaDoc('PUT'), req, db, armazem))?.status, 200);
  assertEquals(apagados, []);
});

Deno.test(
  'confirmar: caminho de outra conta, outro tipo ou mal formado → 400 sem tocar no storage',
  async () => {
    const maus = [
      `${OUTRO_USER}/candidatura/carta_frente/${FICHEIRO}.jpg`,
      `${USER_ID}/candidatura/carta_verso/${FICHEIRO}.jpg`,
      `${USER_ID}/candidatura/carta_frente/../${OUTRO_USER}/x.jpg`,
      `${USER_ID}/candidatura/carta_frente/${FICHEIRO}.exe`,
      `${USER_ID}/candidatura/carta_frente/${FICHEIRO}.jpg/extra`,
      `${USER_ID}/candidatura/carta_frente/nao-uuid.jpg`,
      '',
      CAMINHO.toUpperCase(),
    ];
    for (const caminho of maus) {
      const { db, req } = confirmar(caminho);
      const { armazem, apagados } = armazemFalso();
      const spy: string[] = [];
      armazem.info = (c) => (spy.push(c), Promise.resolve({ tamanho: 1 }));
      const r = await servir(rotaDoc('PUT'), req, db, armazem);
      assertEquals(r?.status, 400, caminho);
      assertEquals(spy, []);
      assertEquals(apagados, []);
      assertEquals(nomes(db), ['auth.getUser']);
    }
    for (const corpo of [{}, { caminho: 1 }, { caminho: CAMINHO, extra: 1 }]) {
      const db = dbFalso();
      const r = await servir(rotaDoc('PUT'), pedido('PUT', corpo), db, armazemFalso().armazem);
      assertEquals(r?.status, 400);
    }
  }
);

Deno.test('confirmar: ficheiro inexistente → 404 sem chamar a RPC', async () => {
  for (const o of [
    { info: { naoExiste: true as const } },
    { inicio: { naoExiste: true as const } },
  ]) {
    const { db, req } = confirmar(CAMINHO);
    const { armazem, apagados } = armazemFalso(o);
    const r = await servir(rotaDoc('PUT'), req, db, armazem);
    assertEquals(r?.status, 404);
    assertEquals(apagados, []);
    assert(!nomes(db).includes('api_conta_candidatura_documento'));
  }
});

Deno.test('confirmar: acima de 10 MB (ou vazio) → 422 e o objecto é apagado', async () => {
  for (const tamanho of [TAMANHO_MAXIMO_DOCUMENTO + 1, 0]) {
    const { db, req } = confirmar(CAMINHO);
    const { armazem, apagados } = armazemFalso({ info: { tamanho } });
    const r = await servir(rotaDoc('PUT'), req, db, armazem);
    assertEquals(r?.status, 422);
    assertEquals((await r!.json()).erro.codigo, 'PEDIDO_INVALIDO');
    assertEquals(apagados, [CAMINHO]);
    assert(!nomes(db).includes('api_conta_candidatura_documento'));
  }
  const { db, req } = confirmar(CAMINHO);
  const r = await servir(
    rotaDoc('PUT'),
    req,
    db,
    armazemFalso({ info: { tamanho: TAMANHO_MAXIMO_DOCUMENTO } }).armazem
  );
  assertEquals(r?.status, 200);
});

Deno.test(
  'confirmar: bytes que não são PDF/JPEG/PNG, ou não batem com a extensão → 422 e apaga',
  async () => {
    for (const bytes of [EXE, PDF, new Uint8Array(0)]) {
      const { db, req } = confirmar(CAMINHO);
      const { armazem, apagados } = armazemFalso({ inicio: { bytes } });
      const r = await servir(rotaDoc('PUT'), req, db, armazem);
      assertEquals(r?.status, 422);
      assertEquals(apagados, [CAMINHO]);
      assert(!nomes(db).includes('api_conta_candidatura_documento'));
    }
  }
);

Deno.test('confirmar: storage indisponível → 503 sem apagar nada', async () => {
  for (const o of [{ info: { erro: 'e' } }, { inicio: { erro: 'e' } }]) {
    const { db, req } = confirmar(CAMINHO);
    const { armazem, apagados } = armazemFalso(o);
    const r = await servir(rotaDoc('PUT'), req, db, armazem);
    assertEquals(r?.status, 503);
    assertEquals(apagados, []);
  }
});

Deno.test('confirmar: erro de negócio da RPC devolve o código e não apaga o objecto', async () => {
  const { db, req } = confirmar(CAMINHO, {
    data: { erro: { codigo: 'CANDIDATURA_NAO_EDITAVEL', mensagem: 'm' } },
    error: null,
  });
  const { armazem, apagados } = armazemFalso();
  const r = await servir(rotaDoc('PUT'), req, db, armazem);
  assertEquals(r?.status, 409);
  assertEquals(apagados, []);
});

// --- remover -------------------------------------------------------------

Deno.test('DELETE: RPC com p_caminho null e apaga o ficheiro removido do storage', async () => {
  const db = dbFalso({
    rpcs: {
      api_conta_candidatura_documento: {
        data: { id: 'c1', caminho_removido: CAMINHO },
        error: null,
      },
    },
  });
  const { armazem, apagados } = armazemFalso();
  const r = await servir(rotaDoc('DELETE'), pedido('DELETE'), db, armazem);
  assertEquals(r?.status, 200);
  assertEquals(await r!.json(), { id: 'c1' });
  assertEquals(db.chamadas[1].args, {
    p_org_id: 'org1',
    p_user_id: USER_ID,
    p_tipo: 'carta_frente',
    p_caminho: null,
  });
  assertEquals(apagados, [CAMINHO]);
});

Deno.test('DELETE: sem ficheiro anterior não toca no storage; NAO_EDITAVEL → 409', async () => {
  const { armazem, apagados } = armazemFalso();
  const db = dbFalso();
  assertEquals((await servir(rotaDoc('DELETE'), pedido('DELETE'), db, armazem))?.status, 200);
  assertEquals(apagados, []);
  const db2 = dbFalso({
    rpcs: {
      api_conta_candidatura_documento: {
        data: { erro: { codigo: 'CANDIDATURA_NAO_EDITAVEL', mensagem: 'm' } },
        error: null,
      },
    },
  });
  assertEquals((await servir(rotaDoc('DELETE'), pedido('DELETE'), db2, armazem))?.status, 409);
  assertEquals(apagados, []);
});

Deno.test('todos os oito tipos de documento são aceites', async () => {
  for (const tipo of [
    'documento_frente',
    'documento_verso',
    'carta_frente',
    'carta_verso',
    'licenca_tvde',
    'registo_criminal',
    'comprovativo_morada',
    'comprovativo_iban',
  ]) {
    const db = dbFalso();
    const r = await servir(rotaDoc('DELETE', tipo), pedido('DELETE'), db, armazemFalso().armazem);
    assertEquals(r?.status, 200, tipo);
    assertEquals(db.chamadas[1].args.p_tipo, tipo);
  }
});
