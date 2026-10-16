import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  LIMITE_CANDIDATURAS_POR_DIA,
  servirCandidaturas,
  validarCorpoCandidatura,
  type VerificadorSessao,
} from './candidaturas.ts';
import type { DbRpc } from './auth.ts';
import type { Rota } from './router.ts';

const HOJE = new Date('2026-10-09T12:00:00Z');
const ID = '2b7c0b7e-1111-4222-8333-444455556666';
const ctx = {
  chaveId: 'k1',
  orgId: 'org1',
  permissoes: ['tvde:candidaturas:write', 'tvde:candidaturas:read'],
  limitePorMinuto: 120,
};

const corpoValido = () => ({
  referencia_externa: 'site-cand-001',
  nome: 'Rui Condutor',
  email: 'Rui.Condutor@Exemplo.pt',
  telefone: '+351 912 345 678',
  nif: '123456789',
  morada: 'Rua das Flores, 10',
  codigo_postal: '1000-100',
  cidade: 'Lisboa',
  documento: { tipo: 'cc', numero: '12345678 9 ZZ1', validade: '2035-01-01' },
  carta_conducao: { numero: 'L-123456', categorias: ['B', 'B1'], validade: '2035-01-01' },
  licenca_tvde: { numero: 'TVDE-2024-001', validade: '2035-01-01' },
  em_formacao_tvde: false,
  iban: 'pt50 0002 0123 1234 5678 9015 4',
  modelo_pretendido_id: ID,
  data_inicio_pretendida: '2026-10-20',
  observacoes: 'Disponível ao fim-de-semana.',
  consentimento: { versao: '2026-10', aceite_em: '2026-10-09T11:58:00+01:00' },
});
type Corpo = ReturnType<typeof corpoValido>;

const rotaPost: Rota = { metodo: 'POST', recurso: 'tvde/candidaturas', id: null };
const rotaGet: Rota = { metodo: 'GET', recurso: 'tvde/candidaturas', id: ID };
const pedido = (metodo: string, body?: unknown, headers: Record<string, string> = {}) =>
  new Request('https://x/v1/tvde/candidaturas', {
    method: metodo,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
// Nos testes do handler o corpo não pode depender do dia em que correm.
const corpoIntemporal = () => ({ ...corpoValido(), data_inicio_pretendida: null });

type Decisao = { allowed: boolean; retry_after: number };
type Sessao = { data: { user: { id: string } | null }; error: unknown };
// Como o AuthApiError do supabase-js: token mau traz status 4xx.
const SEM_SESSAO: Sessao = { data: { user: null }, error: { message: 'invalid JWT', status: 403 } };
function dbFalso(
  o: { limite?: Decisao; resposta?: { data: unknown; error: unknown }; sessao?: Sessao } = {}
) {
  const rpcs: { name: string; args: Record<string, unknown> }[] = [];
  const tokens: string[] = [];
  const db: DbRpc & VerificadorSessao & { rpcs: typeof rpcs; tokens: string[] } = {
    rpcs,
    tokens,
    auth: {
      getUser(jwt: string) {
        tokens.push(jwt);
        // Regista a ordem das chamadas junto das RPCs.
        rpcs.push({ name: 'auth.getUser', args: {} });
        return Promise.resolve(o.sessao ?? SEM_SESSAO);
      },
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcs.push({ name, args });
      if (name === 'consume_edge_rate_limit') {
        return Promise.resolve({
          data: o.limite ?? { allowed: true, retry_after: 0 },
          error: null,
        });
      }
      return Promise.resolve(
        o.resposta ?? {
          data: { id: ID, estado: 'submetido', criada_em: 'x', decidida_em: null },
          error: null,
        }
      );
    },
  };
  return db;
}
const nomes = (db: ReturnType<typeof dbFalso>) => db.rpcs.map((c) => c.name);

Deno.test('corpo válido: email em minúsculas, IBAN sem espaços e em maiúsculas', () => {
  const v = validarCorpoCandidatura(corpoValido(), HOJE);
  assert(v.ok, v.ok ? '' : v.mensagem);
  if (v.ok) {
    assertEquals(v.valor.email, 'rui.condutor@exemplo.pt');
    assertEquals(v.valor.iban, 'PT50000201231234567890154');
    assertEquals(v.valor.licenca_tvde, { numero: 'TVDE-2024-001', validade: '2035-01-01' });
    assertEquals(v.valor.carta_conducao.categorias, ['B', 'B1']);
    assertEquals(v.valor.consentimento.versao, '2026-10');
    assertEquals(v.valor.consentimento.aceite_em, '2026-10-09T10:58:00.000Z');
  }
});

Deno.test('categorias sem B → mensagem a pedir a B', () => {
  const v = validarCorpoCandidatura(
    { ...corpoValido(), carta_conducao: { ...corpoValido().carta_conducao, categorias: ['A'] } },
    HOJE
  );
  assertEquals(v, { ok: false, mensagem: 'carta_conducao.categorias tem de incluir B.' });
});

Deno.test('sem licença e em formação → aceite com licenca_tvde null', () => {
  const v = validarCorpoCandidatura(
    { ...corpoValido(), licenca_tvde: undefined, em_formacao_tvde: true },
    HOJE
  );
  assert(v.ok, v.ok ? '' : v.mensagem);
  if (v.ok) {
    assertEquals(v.valor.licenca_tvde, null);
    assertEquals(v.valor.em_formacao_tvde, true);
  }
});

Deno.test('opcionais em falta → null', () => {
  const c: Record<string, unknown> = corpoValido();
  delete c.modelo_pretendido_id;
  delete c.data_inicio_pretendida;
  delete c.observacoes;
  const v = validarCorpoCandidatura(c, HOJE);
  assert(v.ok, v.ok ? '' : v.mensagem);
  if (v.ok) {
    assertEquals(v.valor.modelo_pretendido_id, null);
    assertEquals(v.valor.data_inicio_pretendida, null);
    assertEquals(v.valor.observacoes, null);
  }
});

Deno.test('recusas de formato', () => {
  const casos: [string, (c: Corpo) => unknown][] = [
    ['corpo não é objecto', () => []],
    ['nome vazio', (c) => ({ ...c, nome: '  ' })],
    ['nome com 201 caracteres', (c) => ({ ...c, nome: 'x'.repeat(201) })],
    ['email sem @', (c) => ({ ...c, email: 'rui.exemplo.pt' })],
    ['telefone com letras', (c) => ({ ...c, telefone: 'ligar já' })],
    ['NIF com 8 dígitos', (c) => ({ ...c, nif: '12345678' })],
    ['código postal sem hífen', (c) => ({ ...c, codigo_postal: '1000100' })],
    ['sem cidade', (c) => ({ ...c, cidade: undefined })],
    ['documento cartao', (c) => ({ ...c, documento: { ...c.documento, tipo: 'cartao' } })],
    [
      'documento caduca hoje',
      (c) => ({ ...c, documento: { ...c.documento, validade: '2026-10-09' } }),
    ],
    [
      'documento caducado',
      (c) => ({ ...c, documento: { ...c.documento, validade: '2020-01-01' } }),
    ],
    ['sem documento', (c) => ({ ...c, documento: undefined })],
    [
      'categoria desconhecida',
      (c) => ({ ...c, carta_conducao: { ...c.carta_conducao, categorias: ['B', 'Z'] } }),
    ],
    [
      'mais de 16 categorias',
      (c) => ({ ...c, carta_conducao: { ...c.carta_conducao, categorias: Array(17).fill('B') } }),
    ],
    [
      'carta caducada',
      (c) => ({ ...c, carta_conducao: { ...c.carta_conducao, validade: '2026-01-01' } }),
    ],
    ['sem licença e sem formação', (c) => ({ ...c, licenca_tvde: null, em_formacao_tvde: false })],
    [
      'licença caducada mesmo em formação',
      (c) => ({
        ...c,
        em_formacao_tvde: true,
        licenca_tvde: { numero: 'TVDE-1', validade: '2026-01-01' },
      }),
    ],
    ['em_formacao_tvde não booleano', (c) => ({ ...c, em_formacao_tvde: 'sim' })],
    ['IBAN com 10 caracteres', (c) => ({ ...c, iban: 'PT50000201' })],
    ['modelo não UUID', (c) => ({ ...c, modelo_pretendido_id: 'corolla' })],
    ['início no passado', (c) => ({ ...c, data_inicio_pretendida: '2026-10-08' })],
    ['início a mais de 180 dias', (c) => ({ ...c, data_inicio_pretendida: '2027-04-08' })],
    ['observações com 1001', (c) => ({ ...c, observacoes: 'x'.repeat(1001) })],
    ['sem consentimento', (c) => ({ ...c, consentimento: undefined })],
    [
      'consentimento sem versão',
      (c) => ({ ...c, consentimento: { ...c.consentimento, versao: '' } }),
    ],
    [
      'aceite_em sem fuso',
      (c) => ({ ...c, consentimento: { ...c.consentimento, aceite_em: '2026-10-09T11:58:00' } }),
    ],
    [
      'aceite_em a mais de 5 minutos no futuro',
      (c) => ({ ...c, consentimento: { ...c.consentimento, aceite_em: '2026-10-09T12:06:00Z' } }),
    ],
    ['referência com espaço', (c) => ({ ...c, referencia_externa: 'site 001' })],
    ['sem referência', (c) => ({ ...c, referencia_externa: undefined })],
  ];
  for (const [nome, f] of casos) {
    assertEquals(validarCorpoCandidatura(f(corpoValido()), HOJE).ok, false, nome);
  }
});

Deno.test('limites que ainda passam: início hoje e a 180 dias, aceite_em a 5 minutos', () => {
  for (const alteracao of [
    { data_inicio_pretendida: '2026-10-09' },
    { data_inicio_pretendida: '2027-04-07' },
    { consentimento: { versao: 'v1', aceite_em: '2026-10-09T12:05:00Z' } },
  ]) {
    const v = validarCorpoCandidatura({ ...corpoValido(), ...alteracao }, HOJE);
    assert(v.ok, JSON.stringify(alteracao));
  }
});

Deno.test('outro recurso → null', async () => {
  const db = dbFalso();
  const r = await servirCandidaturas(
    { metodo: 'GET', recurso: 'tvde/modelos', id: null },
    pedido('GET'),
    ctx,
    db
  );
  assertEquals(r, null);
  assertEquals(db.rpcs.length, 0);
});

Deno.test('POST sem tvde:candidaturas:write → 403; GET sem :read → 403', async () => {
  const soLer = { ...ctx, permissoes: ['tvde:candidaturas:read'] };
  const post = await servirCandidaturas(
    rotaPost,
    pedido('POST', corpoIntemporal()),
    soLer,
    dbFalso()
  );
  assertEquals(post?.status, 403);
  const soEscrever = { ...ctx, permissoes: ['tvde:candidaturas:write'] };
  const db = dbFalso();
  const get = await servirCandidaturas(rotaGet, pedido('GET'), soEscrever, db);
  assertEquals(get?.status, 403);
  assertEquals(db.rpcs.length, 0);
});

Deno.test('POST com id, DELETE e GET sem id → 404', async () => {
  for (const rota of [
    { metodo: 'POST' as const, recurso: 'tvde/candidaturas', id: ID },
    { metodo: 'DELETE' as const, recurso: 'tvde/candidaturas', id: ID },
    { metodo: 'GET' as const, recurso: 'tvde/candidaturas', id: null },
  ]) {
    const db = dbFalso();
    const r = await servirCandidaturas(rota, pedido(rota.metodo), ctx, db);
    assertEquals(r?.status, 404, `${rota.metodo} ${rota.id}`);
    assertEquals(db.rpcs.length, 0);
  }
});

Deno.test('GET com id que não é UUID → 404 sem ir à base', async () => {
  const db = dbFalso();
  const r = await servirCandidaturas({ ...rotaGet, id: 'abc' }, pedido('GET'), ctx, db);
  assertEquals(r?.status, 404);
  assertEquals(db.rpcs.length, 0);
});

Deno.test('GET chama api_tvde_obter_candidatura com org e id, sem cache', async () => {
  const db = dbFalso();
  const r = await servirCandidaturas(rotaGet, pedido('GET'), ctx, db);
  assertEquals(r?.status, 200);
  assertEquals(r?.headers.get('Cache-Control'), 'no-store');
  assertEquals(db.rpcs, [
    { name: 'api_tvde_obter_candidatura', args: { p_org_id: 'org1', p_id: ID } },
  ]);
  const naoExiste = await servirCandidaturas(
    rotaGet,
    pedido('GET'),
    ctx,
    dbFalso({
      resposta: {
        data: { erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Candidatura não encontrada.' } },
        error: null,
      },
    })
  );
  assertEquals(naoExiste?.status, 404);
  assertEquals(naoExiste?.headers.get('Cache-Control'), 'no-store');
});

Deno.test('corpo acima de 64 KB → 413; JSON partido → 400 CORPO_INVALIDO', async () => {
  const db = dbFalso();
  const grande = await servirCandidaturas(
    rotaPost,
    pedido('POST', { ...corpoIntemporal(), observacoes: 'x'.repeat(70000) }),
    ctx,
    db
  );
  assertEquals(grande?.status, 413);
  const partido = await servirCandidaturas(rotaPost, pedido('POST', '{"nome":'), ctx, db);
  assertEquals(partido?.status, 400);
  assertEquals((await partido!.json()).erro.codigo, 'CORPO_INVALIDO');
  assertEquals(db.rpcs.length, 0);
});

Deno.test('corpo inválido → 400 PARAMETRO_INVALIDO sem gastar o limite diário', async () => {
  const db = dbFalso();
  const r = await servirCandidaturas(
    rotaPost,
    pedido('POST', { ...corpoIntemporal(), nif: '1234' }),
    ctx,
    db
  );
  assertEquals(r?.status, 400);
  assertEquals((await r!.json()).erro.codigo, 'PARAMETRO_INVALIDO');
  assertEquals(db.rpcs.length, 0);
});

Deno.test('limite diário esgotado → 429 com Retry-After, sem chamar a RPC', async () => {
  const db = dbFalso({ limite: { allowed: false, retry_after: 3600 } });
  const r = await servirCandidaturas(rotaPost, pedido('POST', corpoIntemporal()), ctx, db);
  assertEquals(r?.status, 429);
  assertEquals(r?.headers.get('Retry-After'), '3600');
  assertEquals(r?.headers.get('Cache-Control'), 'no-store');
  assertEquals((await r!.json()).erro.codigo, 'LIMITE_EXCEDIDO');
  assertEquals(nomes(db), ['consume_edge_rate_limit']);
});

Deno.test('o limite diário é de 50 por chave em 24 horas', async () => {
  const db = dbFalso();
  await servirCandidaturas(rotaPost, pedido('POST', corpoIntemporal()), ctx, db);
  const args = db.rpcs[0].args;
  assertEquals(LIMITE_CANDIDATURAS_POR_DIA, 50);
  assertEquals(args.p_operation, 'api-rent-a-car-candidaturas');
  assertEquals(args.p_limit, 50);
  assertEquals(args.p_window_seconds, 86400);
  assertEquals(typeof args.p_subject_hash, 'string');
});

Deno.test('POST válido → 201, RPC com org, chave e o corpo validado', async () => {
  const db = dbFalso();
  const r = await servirCandidaturas(rotaPost, pedido('POST', corpoIntemporal()), ctx, db);
  assertEquals(r?.status, 201);
  assertEquals(r?.headers.get('Cache-Control'), 'no-store');
  assertEquals((await r!.json()).id, ID);
  assertEquals(nomes(db), ['consume_edge_rate_limit', 'api_tvde_criar_candidatura']);
  const args = db.rpcs[1].args;
  assertEquals(args.p_org_id, 'org1');
  assertEquals(args.p_api_chave_id, 'k1');
  const p = args.p_pedido as Record<string, unknown>;
  assertEquals(p.email, 'rui.condutor@exemplo.pt');
  assertEquals(p.iban, 'PT50000201231234567890154');
  assertEquals(args.p_user_id, null);
  assertEquals(db.tokens, []);
});

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJh';
const USER_ID = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';
const comToken = (token: string) =>
  pedido('POST', corpoIntemporal(), { 'x-motorista-token': token });

Deno.test(
  'X-Motorista-Token vazio ou só espaços → como sem cabeçalho (p_user_id null)',
  async () => {
    for (const token of ['', '   ']) {
      const db = dbFalso();
      const r = await servirCandidaturas(rotaPost, comToken(token), ctx, db);
      assertEquals(r?.status, 201, JSON.stringify(token));
      assertEquals(db.tokens, []);
      assertEquals(db.rpcs[1].args.p_user_id, null);
    }
  }
);

Deno.test('token válido → getUser depois do limite diário e RPC com o id da conta', async () => {
  const db = dbFalso({ sessao: { data: { user: { id: USER_ID } }, error: null } });
  const r = await servirCandidaturas(rotaPost, comToken(`  ${TOKEN} `), ctx, db);
  assertEquals(r?.status, 201);
  assertEquals(db.tokens, [TOKEN]);
  assertEquals(nomes(db), [
    'consume_edge_rate_limit',
    'auth.getUser',
    'api_tvde_criar_candidatura',
  ]);
  assertEquals(db.rpcs[2].args.p_user_id, USER_ID);
  assertEquals(db.rpcs[2].args.p_org_id, 'org1');
});

Deno.test('token rejeitado pelo GoTrue → 401 SESSAO_INVALIDA sem chamar a RPC', async () => {
  for (const sessao of [SEM_SESSAO, { data: { user: null }, error: null }]) {
    const db = dbFalso({ sessao });
    const r = await servirCandidaturas(rotaPost, comToken(TOKEN), ctx, db);
    assertEquals(r?.status, 401);
    assertEquals(r?.headers.get('Cache-Control'), 'no-store');
    const corpo = await r!.json();
    assertEquals(corpo.erro.codigo, 'SESSAO_INVALIDA');
    assertEquals(corpo.erro.mensagem, 'Sessão do motorista inválida ou expirada. Volte a entrar.');
    assertEquals(nomes(db), ['consume_edge_rate_limit', 'auth.getUser']);
  }
});

Deno.test('GoTrue em baixo → 503, não 401: o token pode estar bom', async () => {
  for (const error of [
    { message: 'fetch failed', status: 0 },
    { message: 'x', status: 502 },
    { message: 'rate limited', status: 429 },
    {},
  ]) {
    const db = dbFalso({ sessao: { data: { user: null }, error } });
    const r = await servirCandidaturas(rotaPost, comToken(TOKEN), ctx, db);
    assertEquals(r?.status, 503);
    assertEquals((await r!.json()).erro.codigo, 'ERRO_INTERNO');
    assertEquals(nomes(db), ['consume_edge_rate_limit', 'auth.getUser']);
  }
});

Deno.test('token gigante ou sem forma de JWT → 401 sem getUser e sem gastar o limite', async () => {
  for (const token of ['a'.repeat(2049) + '.' + 'b'.repeat(2047) + '.c', 'nao-e-um-jwt']) {
    const db = dbFalso({ sessao: { data: { user: { id: USER_ID } }, error: null } });
    const r = await servirCandidaturas(rotaPost, comToken(token), ctx, db);
    assertEquals(r?.status, 401, token.slice(0, 20));
    assertEquals((await r!.json()).erro.codigo, 'SESSAO_INVALIDA');
    assertEquals(db.rpcs.length, 0);
  }
});

Deno.test('corpo inválido com token mau → 400: o corpo valida-se primeiro', async () => {
  const db = dbFalso();
  const r = await servirCandidaturas(
    rotaPost,
    pedido('POST', { ...corpoIntemporal(), nif: '1' }, { 'x-motorista-token': 'x' }),
    ctx,
    db
  );
  assertEquals(r?.status, 400);
  assertEquals(db.rpcs.length, 0);
});

Deno.test('limite diário esgotado com token → 429 sem ir ao GoTrue', async () => {
  const db = dbFalso({ limite: { allowed: false, retry_after: 60 } });
  const r = await servirCandidaturas(rotaPost, comToken(TOKEN), ctx, db);
  assertEquals(r?.status, 429);
  assertEquals(db.tokens, []);
});

Deno.test('sessão recusada não deixa o token nem o email nos logs', async () => {
  const registos: unknown[][] = [];
  const originais = { error: console.error, warn: console.warn, log: console.log };
  console.error =
    console.warn =
    console.log =
      (...a: unknown[]) => {
        registos.push(a);
      };
  try {
    const db = dbFalso({
      sessao: { data: { user: null }, error: { message: 'rui.condutor@exemplo.pt expirou' } },
    });
    await servirCandidaturas(rotaPost, comToken(TOKEN), ctx, db);
  } finally {
    Object.assign(console, originais);
  }
  const linha = JSON.stringify(registos);
  assert(!linha.includes(TOKEN), linha);
  assert(!linha.includes('rui.condutor'), linha);
});

Deno.test('CONTA_INVALIDA do SQL → 403; PARAMETRO_INVALIDO (email da conta) → 400', async () => {
  for (const [codigo, estado] of [
    ['CONTA_INVALIDA', 403],
    ['PARAMETRO_INVALIDO', 400],
  ] as const) {
    const db = dbFalso({
      sessao: { data: { user: { id: USER_ID } }, error: null },
      resposta: { data: { erro: { codigo, mensagem: 'x' } }, error: null },
    });
    const r = await servirCandidaturas(rotaPost, comToken(TOKEN), ctx, db);
    assertEquals(r?.status, estado, codigo);
    assertEquals((await r!.json()).erro.codigo, codigo);
  }
});

Deno.test('repetida: true → 200 sem o campo repetida', async () => {
  const db = dbFalso({
    resposta: {
      data: { id: ID, estado: 'submetido', criada_em: 'x', decidida_em: null, repetida: true },
      error: null,
    },
  });
  const r = await servirCandidaturas(rotaPost, pedido('POST', corpoIntemporal()), ctx, db);
  assertEquals(r?.status, 200);
  assertEquals(await r!.json(), { id: ID, estado: 'submetido', criada_em: 'x', decidida_em: null });
});

Deno.test('CANDIDATURA_EXISTENTE → 409', async () => {
  const db = dbFalso({
    resposta: {
      data: { erro: { codigo: 'CANDIDATURA_EXISTENTE', mensagem: 'Já existe.' } },
      error: null,
    },
  });
  const r = await servirCandidaturas(rotaPost, pedido('POST', corpoIntemporal()), ctx, db);
  assertEquals(r?.status, 409);
  assertEquals((await r!.json()).erro.codigo, 'CANDIDATURA_EXISTENTE');
});

Deno.test('erro do PG → 500 e o console.error leva só { rpc, codigo }', async () => {
  const mensagemPg = 'duplicate key value: nif=123456789, email=rui.condutor@exemplo.pt';
  const registos: unknown[][] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => {
    registos.push(a);
  };
  try {
    const r = await servirCandidaturas(
      rotaPost,
      pedido('POST', corpoIntemporal()),
      ctx,
      dbFalso({ resposta: { data: null, error: { code: '23505', message: mensagemPg } } })
    );
    assertEquals(r?.status, 500);
    assertEquals(r?.headers.get('Cache-Control'), 'no-store');
    assertEquals((await r!.json()).erro.codigo, 'ERRO_INTERNO');
  } finally {
    console.error = original;
  }
  assertEquals(registos.length, 1);
  assertEquals(registos[0][1], { rpc: 'api_tvde_criar_candidatura', codigo: '23505' });
  const linha = JSON.stringify(registos[0]);
  assert(!linha.includes('123456789'), linha);
  assert(!linha.includes('rui'), linha);
});

Deno.test('X-Conta-Token também liga a candidatura à conta (mesma validação)', async () => {
  const db = dbFalso({ sessao: { data: { user: { id: USER_ID } }, error: null } });
  const r = await servirCandidaturas(
    rotaPost,
    pedido('POST', corpoIntemporal(), { 'x-conta-token': TOKEN }),
    ctx,
    db
  );
  assertEquals(r?.status, 201);
  assertEquals(db.tokens, [TOKEN]);
  assertEquals(db.rpcs[2].args.p_user_id, USER_ID);
});

Deno.test('X-Conta-Token recusado mantém a mensagem do motorista', async () => {
  const db = dbFalso();
  const r = await servirCandidaturas(
    rotaPost,
    pedido('POST', corpoIntemporal(), { 'x-conta-token': TOKEN }),
    ctx,
    db
  );
  assertEquals(r?.status, 401);
  assertEquals(
    (await r!.json()).erro.mensagem,
    'Sessão do motorista inválida ou expirada. Volte a entrar.'
  );
});
