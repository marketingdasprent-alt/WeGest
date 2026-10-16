import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  LIMITE_PDF_POR_MINUTO,
  LIMITE_PDF_POR_ORG_MINUTO,
  ROTAS_CONTA,
  servirConta,
} from './conta.ts';
import type { PedirPdfFatura, ResultadoPdf } from './faturaPdf.ts';
import type { Rota } from './router.ts';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MSJ9.c2lnbmF0dXJh';
const USER_ID = '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a';
const INVOICE = '2b7c0b7e-1111-4222-8333-444455556666';
const PDF = '%PDF-1.4\n%%EOF';
const ctx = {
  chaveId: 'k1',
  orgId: 'org1',
  permissoes: ['conta:read', 'conta:write'],
  limitePorMinuto: 120,
};

type Sessao = { data: { user: { id: string } | null }; error: unknown };
type Decisao = { allowed: boolean; retry_after: number };
const CONTA_OK: Sessao = { data: { user: { id: USER_ID } }, error: null };
const SEM_SESSAO: Sessao = { data: { user: null }, error: { message: 'invalid JWT', status: 403 } };

interface Opcoes {
  sessao?: Sessao;
  /** O que a RPC api_conta_* devolve. */
  resposta?: { data: unknown; error: unknown };
  limite?: Decisao;
  /** Decisão só para o tecto por organização do PDF. */
  limiteOrg?: Decisao;
}

function dbFalso(o: Opcoes = {}) {
  const chamadas: { name: string; args: Record<string, unknown> }[] = [];
  return {
    chamadas,
    auth: {
      getUser(jwt: string) {
        chamadas.push({ name: 'auth.getUser', args: { jwt } });
        return Promise.resolve(o.sessao ?? CONTA_OK);
      },
    },
    rpc(name: string, args: Record<string, unknown>) {
      chamadas.push({ name, args });
      if (name === 'consume_edge_rate_limit') {
        const daOrg = args.p_operation === 'api-rent-a-car-conta-pdf-org';
        return Promise.resolve({
          data: (daOrg ? o.limiteOrg : o.limite) ?? { allowed: true, retry_after: 0 },
          error: null,
        });
      }
      if (o.resposta) return Promise.resolve(o.resposta);
      if (name === 'api_conta_fatura') {
        return Promise.resolve({
          data: { id: INVOICE, tipo: 'FT', serie: '67', numero: '12', total: 105 },
          error: null,
        });
      }
      if (name === 'api_conta_reservas' || name === 'api_conta_faturas') {
        return Promise.resolve({ data: [], error: null });
      }
      return Promise.resolve({ data: { ok: name }, error: null });
    },
  };
}
const nomes = (db: ReturnType<typeof dbFalso>) => db.chamadas.map((c) => c.name);

function pdfFalso(resultado: ResultadoPdf = { base64: btoa(PDF) }) {
  const pedidos: [string, string][] = [];
  const f: PedirPdfFatura = (invoiceId, orgId) => {
    pedidos.push([invoiceId, orgId]);
    return Promise.resolve(resultado);
  };
  return { pedidos, f };
}

const rota = (metodo: Rota['metodo'], recurso: string, id: string | null = null): Rota => ({
  metodo,
  recurso,
  id,
});
const pedido = (metodo = 'GET', cabecalhos: Record<string, string> = { 'x-conta-token': TOKEN }) =>
  new Request('https://x/v1/conta', { method: metodo, headers: cabecalhos });

Deno.test('recurso que não é da conta → null, sem tocar em nada', async () => {
  const db = dbFalso();
  for (const recurso of ['reservas', 'contas', 'tvde/modelos', 'contactos']) {
    assertEquals(await servirConta(rota('GET', recurso), pedido(), ctx, db, pdfFalso().f), null);
  }
  assertEquals(db.chamadas, []);
});

Deno.test('cada rota GET chama a sua RPC com org da chave e user do token, sem cache', async () => {
  const casos: [string, string][] = [
    ['conta', 'api_conta'],
    ['conta/reservas', 'api_conta_reservas'],
    ['conta/faturas', 'api_conta_faturas'],
  ];
  for (const [recurso, rpc] of casos) {
    const db = dbFalso();
    const r = await servirConta(rota('GET', recurso), pedido(), ctx, db, pdfFalso().f);
    assertEquals(r?.status, 200, recurso);
    assertEquals(r?.headers.get('Cache-Control'), 'no-store', recurso);
    assertEquals(nomes(db), ['auth.getUser', rpc], recurso);
    assertEquals(db.chamadas[1].args, { p_org_id: 'org1', p_user_id: USER_ID }, recurso);
  }
});

Deno.test('listas vazias vêm como []; null da RPC numa lista também', async () => {
  const db = dbFalso({ resposta: { data: null, error: null } });
  const r = await servirConta(rota('GET', 'conta/reservas'), pedido(), ctx, db, pdfFalso().f);
  assertEquals(await r!.json(), []);
});

Deno.test('X-Motorista-Token serve de token da conta (compatibilidade)', async () => {
  const db = dbFalso();
  const r = await servirConta(
    rota('GET', 'conta'),
    pedido('GET', { 'x-motorista-token': TOKEN }),
    ctx,
    db,
    pdfFalso().f
  );
  assertEquals(r?.status, 200);
  assertEquals(db.chamadas[0].args.jwt, TOKEN);
});

Deno.test('sem token → 401 SESSAO_INVALIDA sem ir ao GoTrue nem à base', async () => {
  for (const [recurso, metodo, id] of [
    ['conta', 'GET', null],
    ['conta/reservas', 'GET', null],
    ['conta/reservas', 'DELETE', '7'],
    ['conta/faturas', 'GET', null],
    ['conta/faturas', 'GET', INVOICE],
  ] as const) {
    const db = dbFalso();
    const r = await servirConta(
      rota(metodo, recurso, id),
      pedido(metodo, {}),
      ctx,
      db,
      pdfFalso().f
    );
    assertEquals(r?.status, 401, `${metodo} ${recurso}`);
    assertEquals(r?.headers.get('Cache-Control'), 'no-store');
    assertEquals((await r!.json()).erro.codigo, 'SESSAO_INVALIDA');
    assertEquals(db.chamadas, []);
  }
});

Deno.test('token recusado pelo GoTrue → 401; GoTrue em baixo → 503; sem chamar a RPC', async () => {
  const recusado = dbFalso({ sessao: SEM_SESSAO });
  const r401 = await servirConta(rota('GET', 'conta'), pedido(), ctx, recusado, pdfFalso().f);
  assertEquals(r401?.status, 401);
  assertEquals(nomes(recusado), ['auth.getUser']);
  const emBaixo = dbFalso({ sessao: { data: { user: null }, error: { status: 503 } } });
  const r503 = await servirConta(rota('GET', 'conta'), pedido(), ctx, emBaixo, pdfFalso().f);
  assertEquals(r503?.status, 503);
  assertEquals(nomes(emBaixo), ['auth.getUser']);
});

Deno.test('token sem forma de JWT → 401 sem GoTrue', async () => {
  const db = dbFalso();
  const r = await servirConta(
    rota('GET', 'conta'),
    pedido('GET', { 'x-conta-token': 'abc' }),
    ctx,
    db,
    pdfFalso().f
  );
  assertEquals(r?.status, 401);
  assertEquals(db.chamadas, []);
});

Deno.test(
  'permissões: GET pede conta:read, DELETE pede conta:write (403 antes do token)',
  async () => {
    const soLer = { ...ctx, permissoes: ['conta:read'] };
    const db = dbFalso();
    const del = await servirConta(
      rota('DELETE', 'conta/reservas', '7'),
      pedido('DELETE'),
      soLer,
      db,
      pdfFalso().f
    );
    assertEquals(del?.status, 403);
    assertEquals((await del!.json()).erro.mensagem, 'A chave não tem a permissão conta:write.');
    const soEscrever = { ...ctx, permissoes: ['conta:write', 'reservas:read'] };
    for (const [recurso, id] of [
      ['conta', null],
      ['conta/reservas', null],
      ['conta/faturas', null],
      ['conta/faturas', INVOICE],
    ] as const) {
      const r = await servirConta(rota('GET', recurso, id), pedido(), soEscrever, db, pdfFalso().f);
      assertEquals(r?.status, 403, recurso);
    }
    assertEquals(db.chamadas, []);
  }
);

Deno.test('o router e a tabela de rotas batem: conta:read nos GET, conta:write no DELETE', () => {
  for (const r of ROTAS_CONTA) {
    assertEquals(r.permissao, r.metodo === 'GET' ? 'conta:read' : 'conta:write', r.rpc);
  }
});

Deno.test('rotas inexistentes da conta → 404 sem token nem base', async () => {
  for (const [metodo, recurso, id] of [
    ['POST', 'conta', null],
    ['GET', 'conta', 'x1'],
    ['DELETE', 'conta', null],
    ['GET', 'conta/reservas', '7'],
    ['POST', 'conta/reservas', null],
    ['DELETE', 'conta/reservas', null],
    ['DELETE', 'conta/faturas', INVOICE],
    ['GET', 'conta/perfil', null],
    ['GET', 'conta/tvde', null],
  ] as const) {
    const db = dbFalso();
    const r = await servirConta(rota(metodo, recurso, id), pedido(metodo), ctx, db, pdfFalso().f);
    assertEquals(r?.status, 404, `${metodo} ${recurso} ${id}`);
    assertEquals(r?.headers.get('Cache-Control'), 'no-store');
    assertEquals(db.chamadas, []);
  }
});

Deno.test('DELETE com código que não é inteiro positivo → 404 sem GoTrue nem base', async () => {
  for (const codigo of ['abc', '0', '00', '1234567890123', '-1', '1e3']) {
    const db = dbFalso();
    const r = await servirConta(
      rota('DELETE', 'conta/reservas', codigo),
      pedido('DELETE'),
      ctx,
      db,
      pdfFalso().f
    );
    assertEquals(r?.status, 404, codigo);
    assertEquals(db.chamadas, [], codigo);
  }
});

Deno.test('DELETE cancela com o código em número; ESTADO_INVALIDO → 409; outra → 404', async () => {
  const db = dbFalso();
  const r = await servirConta(
    rota('DELETE', 'conta/reservas', '1042'),
    pedido('DELETE'),
    ctx,
    db,
    pdfFalso().f
  );
  assertEquals(r?.status, 200);
  assertEquals(db.chamadas[1], {
    name: 'api_conta_cancelar_reserva',
    args: { p_org_id: 'org1', p_user_id: USER_ID, p_codigo: 1042 },
  });
  for (const [codigo, estado] of [
    ['ESTADO_INVALIDO', 409],
    ['NAO_ENCONTRADO', 404],
    ['CONTA_INVALIDA', 403],
  ] as const) {
    const erroSql = dbFalso({
      resposta: { data: { erro: { codigo, mensagem: 'x' } }, error: null },
    });
    const e = await servirConta(
      rota('DELETE', 'conta/reservas', '7'),
      pedido('DELETE'),
      ctx,
      erroSql,
      pdfFalso().f
    );
    assertEquals(e?.status, estado, codigo);
    assertEquals((await e!.json()).erro.codigo, codigo);
    assertEquals(e?.headers.get('Cache-Control'), 'no-store');
  }
});

Deno.test('erro do PG → 500 e o log leva só { rpc, codigo }', async () => {
  const registos: unknown[][] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => {
    registos.push(a);
  };
  try {
    const db = dbFalso({
      resposta: { data: null, error: { code: '42883', message: 'ana@exemplo.pt 123456789' } },
    });
    const r = await servirConta(rota('GET', 'conta'), pedido(), ctx, db, pdfFalso().f);
    assertEquals(r?.status, 500);
    assertEquals((await r!.json()).erro.codigo, 'ERRO_INTERNO');
  } finally {
    console.error = original;
  }
  assertEquals(registos.length, 1);
  assertEquals(registos[0][1], { rpc: 'api_conta', codigo: '42883' });
});

// --- PDF da fatura -------------------------------------------------------------------

Deno.test('PDF: valida a fatura da conta e devolve application/pdf inline', async () => {
  const db = dbFalso();
  const pdf = pdfFalso();
  const r = await servirConta(rota('GET', 'conta/faturas', INVOICE), pedido(), ctx, db, pdf.f);
  assertEquals(r?.status, 200);
  assertEquals(r?.headers.get('Content-Type'), 'application/pdf');
  assertEquals(r?.headers.get('Content-Disposition'), 'inline; filename="67 12.pdf"');
  assertEquals(r?.headers.get('Cache-Control'), 'private, no-store');
  assertEquals(await r!.text(), PDF);
  assertEquals(nomes(db), [
    'auth.getUser',
    'consume_edge_rate_limit',
    'api_conta_fatura',
    'consume_edge_rate_limit',
  ]);
  assertEquals(db.chamadas[2].args, {
    p_org_id: 'org1',
    p_user_id: USER_ID,
    p_invoice_id: INVOICE,
  });
  // O PDF pede-se com o id da linha validada e a org da chave, nunca com o que veio no URL.
  assertEquals(pdf.pedidos, [[INVOICE, 'org1']]);
});

Deno.test('PDF: limite próprio de 10 por minuto, por conta e chave', async () => {
  const db = dbFalso();
  await servirConta(rota('GET', 'conta/faturas', INVOICE), pedido(), ctx, db, pdfFalso().f);
  const args = db.chamadas[1].args;
  assertEquals(LIMITE_PDF_POR_MINUTO, 10);
  assertEquals(args.p_operation, 'api-rent-a-car-conta-pdf');
  assertEquals(args.p_limit, 10);
  assertEquals(args.p_window_seconds, 60);
  // A identidade vai em hash: nem o id da conta nem o da chave aparecem.
  assert(!JSON.stringify(args).includes(USER_ID));
});

Deno.test(
  'PDF: limite esgotado → 429 com Retry-After, sem ir à base nem ao fornecedor',
  async () => {
    const db = dbFalso({ limite: { allowed: false, retry_after: 30 } });
    const pdf = pdfFalso();
    const r = await servirConta(rota('GET', 'conta/faturas', INVOICE), pedido(), ctx, db, pdf.f);
    assertEquals(r?.status, 429);
    assertEquals(r?.headers.get('Retry-After'), '30');
    assertEquals(r?.headers.get('Cache-Control'), 'no-store');
    assertEquals(nomes(db), ['auth.getUser', 'consume_edge_rate_limit']);
    assertEquals(pdf.pedidos, []);
  }
);

Deno.test('PDF: tecto por organização, contado só depois de validar a fatura', async () => {
  const db = dbFalso({ limiteOrg: { allowed: false, retry_after: 20 } });
  const pdf = pdfFalso();
  const r = await servirConta(rota('GET', 'conta/faturas', INVOICE), pedido(), ctx, db, pdf.f);
  assertEquals(r?.status, 429);
  assertEquals(nomes(db).slice(-2), ['api_conta_fatura', 'consume_edge_rate_limit']);
  const args = db.chamadas[3].args;
  assertEquals(args.p_operation, 'api-rent-a-car-conta-pdf-org');
  assertEquals(args.p_limit, LIMITE_PDF_POR_ORG_MINUTO);
  assertEquals(pdf.pedidos, []);
});

Deno.test('PDF: id que não é UUID → 404 sem GoTrue, base nem fornecedor', async () => {
  const db = dbFalso();
  const pdf = pdfFalso();
  const r = await servirConta(rota('GET', 'conta/faturas', 'FT-67-12'), pedido(), ctx, db, pdf.f);
  assertEquals(r?.status, 404);
  assertEquals((await r!.json()).erro.mensagem, 'Fatura não encontrada.');
  assertEquals(db.chamadas, []);
  assertEquals(pdf.pedidos, []);
});

Deno.test('PDF: fatura de outra pessoa (NAO_ENCONTRADO do SQL) → 404 sem pedir o PDF', async () => {
  const db = dbFalso({
    resposta: {
      data: { erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Fatura não encontrada.' } },
      error: null,
    },
  });
  const pdf = pdfFalso();
  const r = await servirConta(rota('GET', 'conta/faturas', INVOICE), pedido(), ctx, db, pdf.f);
  assertEquals(r?.status, 404);
  assertEquals(r?.headers.get('Cache-Control'), 'no-store');
  assertEquals(pdf.pedidos, []);
});

Deno.test(
  'PDF: falha do fornecedor ou PDF inválido → 503 "Fatura indisponível de momento"',
  async () => {
    for (const resultado of [
      { erro: 'HTTP 500' },
      { base64: btoa('<html>erro</html>') },
      { base64: '%%' },
    ]) {
      const r = await servirConta(
        rota('GET', 'conta/faturas', INVOICE),
        pedido(),
        ctx,
        dbFalso(),
        pdfFalso(resultado).f
      );
      assertEquals(r?.status, 503, JSON.stringify(resultado));
      assertEquals(r?.headers.get('Cache-Control'), 'no-store');
      const corpo = await r!.json();
      assertEquals(corpo.erro, {
        codigo: 'ERRO_INTERNO',
        mensagem: 'Fatura indisponível de momento.',
      });
    }
  }
);

Deno.test('PDF: fatura sem número no fornecedor → 404 "não tem PDF disponível"', async () => {
  const r = await servirConta(
    rota('GET', 'conta/faturas', INVOICE),
    pedido(),
    ctx,
    dbFalso(),
    pdfFalso({ erro: 'pdf: o documento não tem número no fornecedor.', semPdf: true }).f
  );
  assertEquals(r?.status, 404);
  assertEquals(r?.headers.get('Cache-Control'), 'no-store');
  assertEquals((await r!.json()).erro, {
    codigo: 'NAO_ENCONTRADO',
    mensagem: 'Esta fatura não tem PDF disponível.',
  });
});

Deno.test('PDF: a falha vai para o log com o invoice_id e a mensagem do fornecedor', async () => {
  const registos: unknown[][] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => {
    registos.push(a);
  };
  try {
    await servirConta(
      rota('GET', 'conta/faturas', INVOICE),
      pedido(),
      ctx,
      dbFalso(),
      pdfFalso({ erro: 'Agente Primavera offline' }).f
    );
  } finally {
    console.error = original;
  }
  assertEquals(registos.length, 1);
  assertEquals(registos[0][1], { invoice_id: INVOICE, erro: 'Agente Primavera offline' });
});

Deno.test('PDF: os logs nunca levam o base64, o token nem o email', async () => {
  const registos: unknown[][] = [];
  const originais = { error: console.error, warn: console.warn, log: console.log };
  console.error =
    console.warn =
    console.log =
      (...a: unknown[]) => {
        registos.push(a);
      };
  const naoPdf = btoa('<html>ana@exemplo.pt</html>');
  try {
    await servirConta(
      rota('GET', 'conta/faturas', INVOICE),
      pedido(),
      ctx,
      dbFalso(),
      pdfFalso({ base64: naoPdf }).f
    );
    await servirConta(
      rota('GET', 'conta/faturas', INVOICE),
      pedido(),
      ctx,
      dbFalso(),
      pdfFalso({ erro: 'ana@exemplo.pt' }).f
    );
    await servirConta(
      rota('GET', 'conta'),
      pedido(),
      ctx,
      dbFalso({ sessao: SEM_SESSAO }),
      pdfFalso().f
    );
  } finally {
    Object.assign(console, originais);
  }
  const linha = JSON.stringify(registos);
  assertEquals(registos.length, 2);
  assert(!linha.includes(naoPdf), linha);
  assert(!linha.includes(TOKEN), linha);
  assert(!linha.includes('ana@exemplo.pt'), linha);
  assert(linha.includes(INVOICE), linha);
});
