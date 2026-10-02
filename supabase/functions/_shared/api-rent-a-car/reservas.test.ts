import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { servirReservas, validarCorpoReserva } from './reservas.ts';

const ctx = {
  chaveId: 'k1',
  orgId: 'org1',
  permissoes: ['reservas:write', 'reservas:read'],
  limitePorMinuto: 120,
};
const E = '00000000-0000-0000-0000-000000000301';
const M = '00000000-0000-0000-0000-000000000d01';
const corpo = () => ({
  modelo_id: M,
  inicio: '2026-10-20T10:00:00+01:00',
  fim: '2026-10-23T10:00:00+01:00',
  entrega: E,
  recolha: E,
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
});
const semBase = {
  rpc(): never {
    throw new Error('não devia chamar a base');
  },
};
const pedido = (metodo: string, caminho: string, body?: unknown) =>
  new Request(`https://x/v1/${caminho}`, {
    method: metodo,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });

Deno.test('corpo válido: email em minúsculas, sem NIF aceite (cliente estrangeiro)', () => {
  const v = validarCorpoReserva(corpo());
  assert(v.ok);
  if (v.ok) {
    assertEquals(v.valor.cliente.email, 'carla@novo.pt');
    assertEquals(v.valor.cliente.nif, null);
    assertEquals(v.valor.mensagem, null);
  }
});

Deno.test('recusas de formato', () => {
  const casos: [string, (c: ReturnType<typeof corpo>) => unknown][] = [
    ['sem cliente', (c) => ({ ...c, cliente: undefined })],
    ['email inválido', (c) => ({ ...c, cliente: { ...c.cliente, email: 'carla' } })],
    ['NIF com 8 dígitos', (c) => ({ ...c, cliente: { ...c.cliente, nif: '12345678' } })],
    [
      'nascimento no futuro',
      (c) => ({ ...c, cliente: { ...c.cliente, data_nascimento: '2099-01-01' } }),
    ],
    [
      'data impossível',
      (c) => ({ ...c, cliente: { ...c.cliente, data_nascimento: '1990-02-31' } }),
    ],
    // O Postgres recusa o ano 0 com erro (500): a edge corta antes de 1900.
    [
      'nascimento no ano 0',
      (c) => ({ ...c, cliente: { ...c.cliente, data_nascimento: '0000-01-01' } }),
    ],
    [
      'nascimento antes de 1900',
      (c) => ({ ...c, cliente: { ...c.cliente, data_nascimento: '1899-12-31' } }),
    ],
    [
      'validade da carta no ano 0',
      (c) => ({ ...c, carta_conducao: { ...c.carta_conducao, validade: '0000-01-01' } }),
    ],
    [
      'carta caduca antes do fim',
      (c) => ({ ...c, carta_conducao: { ...c.carta_conducao, validade: '2026-10-22' } }),
    ],
    ['total com 3 casas', (c) => ({ ...c, total_esperado: 129.155 })],
    ['total negativo', (c) => ({ ...c, total_esperado: -1 })],
    ['referência com espaço', (c) => ({ ...c, referencia_externa: 'site 001' })],
    ['sem referência', (c) => ({ ...c, referencia_externa: undefined })],
    ['mensagem enorme', (c) => ({ ...c, mensagem: 'x'.repeat(1001) })],
    ['data sem fuso (herdado da cotação)', (c) => ({ ...c, inicio: '2026-10-20T10:00' })],
  ];
  for (const [nome, f] of casos) assertEquals(validarCorpoReserva(f(corpo())).ok, false, nome);
});

Deno.test(
  'nascimento 0000-01-01 → 400 PARAMETRO_INVALIDO sem ir à base; 1900-01-01 passa',
  async () => {
    const c = corpo();
    const r = await servirReservas(
      { metodo: 'POST', recurso: 'reservas', id: null },
      pedido('POST', 'reservas', {
        ...c,
        cliente: { ...c.cliente, data_nascimento: '0000-01-01' },
      }),
      ctx,
      semBase
    );
    assertEquals(r?.status, 400);
    assertEquals((await r!.json()).erro.codigo, 'PARAMETRO_INVALIDO');
    const limite = { ...c, cliente: { ...c.cliente, data_nascimento: '1900-01-01' } };
    assertEquals(validarCorpoReserva(limite).ok, true);
  }
);

Deno.test('sem reservas:write → 403 sem ir à base', async () => {
  const r = await servirReservas(
    { metodo: 'POST', recurso: 'reservas', id: null },
    pedido('POST', 'reservas', corpo()),
    { ...ctx, permissoes: ['reservas:read'] },
    semBase
  );
  assertEquals(r?.status, 403);
});

Deno.test('código que não é número → 404 sem ir à base', async () => {
  const r = await servirReservas(
    { metodo: 'GET', recurso: 'reservas', id: 'abc' },
    pedido('GET', 'reservas/abc'),
    ctx,
    semBase
  );
  assertEquals(r?.status, 404);
});

Deno.test(
  'POST cria → 201, chama api_criar_reserva com a chave e datas em UTC, sem cache',
  async () => {
    let args: Record<string, unknown> = {};
    const db = {
      rpc(nome: string, a: Record<string, unknown>) {
        assertEquals(nome, 'api_criar_reserva');
        args = a;
        return Promise.resolve({ data: { id: 'r1', codigo: 7, estado: 'pendente' }, error: null });
      },
    };
    const r = await servirReservas(
      { metodo: 'POST', recurso: 'reservas', id: null },
      pedido('POST', 'reservas', corpo()),
      ctx,
      db
    );
    assertEquals(r?.status, 201);
    assertEquals(r?.headers.get('Cache-Control'), 'no-store');
    assertEquals(args.p_org_id, 'org1');
    assertEquals(args.p_api_chave_id, 'k1');
    assertEquals((args.p_pedido as { inicio: string }).inicio, '2026-10-20T09:00:00.000Z');
  }
);

Deno.test('POST repetido → 200 e o corpo não leva "repetida"', async () => {
  const db = {
    rpc: () =>
      Promise.resolve({
        data: { id: 'r1', codigo: 7, estado: 'pendente', repetida: true },
        error: null,
      }),
  };
  const r = await servirReservas(
    { metodo: 'POST', recurso: 'reservas', id: null },
    pedido('POST', 'reservas', corpo()),
    ctx,
    db
  );
  assertEquals(r?.status, 200);
  assertEquals('repetida' in (await r!.json()), false);
});

Deno.test('PRECO_ALTERADO → 409 com a cotação em detalhes', async () => {
  const db = {
    rpc: () =>
      Promise.resolve({
        data: {
          erro: { codigo: 'PRECO_ALTERADO', mensagem: 'O preço mudou.', detalhes: { subtotal: 1 } },
        },
        error: null,
      }),
  };
  const r = await servirReservas(
    { metodo: 'POST', recurso: 'reservas', id: null },
    pedido('POST', 'reservas', corpo()),
    ctx,
    db
  );
  assertEquals(r?.status, 409);
  assertEquals((await r!.json()).erro.detalhes, { subtotal: 1 });
});

Deno.test(
  'DELETE de reserva confirmada → 409 ESTADO_INVALIDO; GET chama api_obter_reserva',
  async () => {
    const del = await servirReservas(
      { metodo: 'DELETE', recurso: 'reservas', id: '7' },
      pedido('DELETE', 'reservas/7'),
      ctx,
      {
        rpc(nome: string, a: Record<string, unknown>) {
          assertEquals(nome, 'api_cancelar_reserva');
          assertEquals(a.p_codigo, 7);
          return Promise.resolve({
            data: { erro: { codigo: 'ESTADO_INVALIDO', mensagem: 'Já confirmada.' } },
            error: null,
          });
        },
      }
    );
    assertEquals(del?.status, 409);
    const get = await servirReservas(
      { metodo: 'GET', recurso: 'reservas', id: '7' },
      pedido('GET', 'reservas/7'),
      ctx,
      {
        rpc(nome: string) {
          assertEquals(nome, 'api_obter_reserva');
          return Promise.resolve({ data: { id: 'r1', codigo: 7 }, error: null });
        },
      }
    );
    assertEquals(get?.status, 200);
  }
);

Deno.test('GET /reservas sem código e POST com código → 404', async () => {
  for (const rota of [
    { metodo: 'GET' as const, recurso: 'reservas', id: null },
    { metodo: 'POST' as const, recurso: 'reservas', id: '7' },
  ]) {
    const r = await servirReservas(rota, pedido(rota.metodo, 'reservas'), ctx, semBase);
    assertEquals(r?.status, 404);
  }
});

Deno.test('outro recurso → null (segue para o próximo serviço)', async () => {
  const r = await servirReservas(
    { metodo: 'GET', recurso: 'modelos', id: null },
    pedido('GET', 'modelos'),
    ctx,
    semBase
  );
  assertEquals(r, null);
});

Deno.test(
  'erro do PG → 500 e o console.error leva só o código e a RPC, nunca a mensagem',
  async () => {
    const mensagemPg = 'invalid input syntax for type date: "carla@novo.pt"';
    const registos: unknown[][] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => {
      registos.push(a);
    };
    try {
      const r = await servirReservas(
        { metodo: 'POST', recurso: 'reservas', id: null },
        pedido('POST', 'reservas', corpo()),
        ctx,
        {
          rpc: () => Promise.resolve({ data: null, error: { code: '22007', message: mensagemPg } }),
        }
      );
      assertEquals(r?.status, 500);
      assertEquals((await r!.json()).erro.codigo, 'ERRO_INTERNO');
    } finally {
      console.error = original;
    }
    assertEquals(registos.length, 1);
    const linha = JSON.stringify(registos[0]);
    assert(!linha.includes('carla'), linha);
    assert(!linha.includes('invalid input'), linha);
    assert(linha.includes('22007'), linha);
    assert(linha.includes('api_criar_reserva'), linha);
  }
);
