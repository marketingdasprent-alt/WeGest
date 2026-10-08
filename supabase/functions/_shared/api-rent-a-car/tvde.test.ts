import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import type { Rota } from './router.ts';
import { servirTvde } from './tvde.ts';

const ctx = {
  chaveId: 'k1',
  orgId: 'org1',
  permissoes: ['tvde:catalogo:read'],
  limitePorMinuto: 120,
};
const UUID = '2b7c0b7e-1111-4222-8333-444455556666';
const INICIO = '2026-10-12T09:00:00+01:00';

const semBase = {
  rpc(): never {
    throw new Error('não devia chamar a base');
  },
};
function base(esperado: string, args: Record<string, unknown>, data: unknown) {
  return {
    rpc(nome: string, a: Record<string, unknown>) {
      assertEquals(nome, esperado);
      assertEquals(a, args);
      return Promise.resolve({ data, error: null });
    },
  };
}
const rota = (recurso: string, id: string | null = null, metodo: Rota['metodo'] = 'GET'): Rota => ({
  metodo,
  recurso,
  id,
});
const url = (caminho: string) => new URL(`https://x/v1/${caminho}`);

Deno.test('recurso que não é TVDE devolve null', async () => {
  for (const recurso of ['modelos', 'disponibilidade', 'tvde', 'tvde/xyz']) {
    assertEquals(await servirTvde(rota(recurso), url(recurso), ctx, semBase), null, recurso);
  }
});

Deno.test('sem tvde:catalogo:read → 403 nas três rotas, sem tocar na base', async () => {
  const soRentACar = { ...ctx, permissoes: ['catalogo:read', 'disponibilidade:read'] };
  for (const [r, caminho] of [
    [rota('tvde/modelos'), 'tvde/modelos'],
    [rota('tvde/modelos', UUID), `tvde/modelos/${UUID}`],
    [rota('tvde/disponibilidade'), `tvde/disponibilidade?inicio=${INICIO}`],
  ] as const) {
    const resposta = await servirTvde(r, url(caminho), soRentACar, semBase);
    assertEquals(resposta?.status, 403, caminho);
    assertEquals((await resposta!.json()).erro.codigo, 'SEM_PERMISSAO');
  }
});

Deno.test('GET /tvde/modelos chama api_tvde_modelos com cache PRIVADA de 5 minutos', async () => {
  const r = await servirTvde(
    rota('tvde/modelos'),
    url('tvde/modelos'),
    ctx,
    base('api_tvde_modelos', { p_org_id: 'org1' }, [{ id: UUID }])
  );
  assertEquals(r?.status, 200);
  assertEquals(r?.headers.get('cache-control'), 'private, max-age=300');
  assertEquals(r?.headers.get('vary'), 'Origin, X-API-Key, Authorization');
  assertEquals(await r?.json(), [{ id: UUID }]);
});

Deno.test('GET /tvde/modelos sem dados devolve lista vazia', async () => {
  const r = await servirTvde(
    rota('tvde/modelos'),
    url('tvde/modelos'),
    ctx,
    base('api_tvde_modelos', { p_org_id: 'org1' }, null)
  );
  assertEquals(await r?.json(), []);
});

Deno.test('GET /tvde/modelos/{id} chama api_tvde_modelo; null → 404', async () => {
  const r = await servirTvde(
    rota('tvde/modelos', UUID),
    url(`tvde/modelos/${UUID}`),
    ctx,
    base('api_tvde_modelo', { p_org_id: 'org1', p_modelo_id: UUID }, { id: UUID })
  );
  assertEquals(r?.status, 200);
  assertEquals(r?.headers.get('cache-control'), 'private, max-age=300');
  assertEquals(await r?.json(), { id: UUID });

  const naoPublicavel = await servirTvde(
    rota('tvde/modelos', UUID),
    url(`tvde/modelos/${UUID}`),
    ctx,
    base('api_tvde_modelo', { p_org_id: 'org1', p_modelo_id: UUID }, null)
  );
  assertEquals(naoPublicavel?.status, 404);
  assertEquals((await naoPublicavel!.json()).erro.codigo, 'NAO_ENCONTRADO');
});

Deno.test('GET /tvde/modelos/{id} com id que não é UUID → 404 sem tocar na base', async () => {
  for (const id of ['zzz', '123', UUID.slice(0, -1)]) {
    const r = await servirTvde(rota('tvde/modelos', id), url(`tvde/modelos/${id}`), ctx, semBase);
    assertEquals(r?.status, 404, id);
  }
});

Deno.test('disponibilidade com id, ou método que não é GET → 404', async () => {
  const comId = await servirTvde(
    rota('tvde/disponibilidade', UUID),
    url(`tvde/disponibilidade/${UUID}`),
    ctx,
    semBase
  );
  assertEquals(comId?.status, 404);
  const post = await servirTvde(
    rota('tvde/modelos', null, 'POST'),
    url('tvde/modelos'),
    ctx,
    semBase
  );
  assertEquals(post?.status, 404);
});

Deno.test('GET /tvde/disponibilidade sem inicio ou sem fuso → 400 sem ir à base', async () => {
  for (const q of ['', '?inicio=2026-10-12T09:00', '?inicio=amanha']) {
    const r = await servirTvde(
      rota('tvde/disponibilidade'),
      url(`tvde/disponibilidade${q}`),
      ctx,
      semBase
    );
    assertEquals(r?.status, 400, q);
    assertEquals((await r!.json()).erro.codigo, 'PARAMETRO_INVALIDO');
    assertEquals(r?.headers.get('cache-control'), 'no-store');
  }
});

Deno.test('GET /tvde/disponibilidade válido passa inicio em UTC e não guarda cache', async () => {
  const corpo = { inicio: '2026-10-12T08:00:00+00:00', modelos: [] };
  const r = await servirTvde(
    rota('tvde/disponibilidade'),
    url(`tvde/disponibilidade?inicio=${encodeURIComponent(INICIO)}`),
    ctx,
    base(
      'api_tvde_disponibilidade',
      { p_org_id: 'org1', p_inicio: '2026-10-12T08:00:00.000Z' },
      corpo
    )
  );
  assertEquals(r?.status, 200);
  assertEquals(r?.headers.get('cache-control'), 'no-store');
  assertEquals(await r?.json(), corpo);
});

Deno.test(
  'erros de negócio: CONFIG_EM_FALTA → 503, PERIODO_INVALIDO → 400, sem cache',
  async () => {
    for (const [codigo, estado] of [
      ['CONFIG_EM_FALTA', 503],
      ['PERIODO_INVALIDO', 400],
    ] as const) {
      const r = await servirTvde(
        rota('tvde/disponibilidade'),
        url(`tvde/disponibilidade?inicio=${encodeURIComponent(INICIO)}`),
        ctx,
        {
          rpc: () => Promise.resolve({ data: { erro: { codigo, mensagem: 'm' } }, error: null }),
        }
      );
      assertEquals(r?.status, estado, codigo);
      assertEquals(await r?.json(), { erro: { codigo, mensagem: 'm' } });
      assertEquals(r?.headers.get('cache-control'), 'no-store');
    }
  }
);

Deno.test('erro do PG → 500 e o log leva só o código e a RPC, nunca a mensagem', async () => {
  const mensagemPg = 'relation "api_tvde_x" does not exist: org1';
  const registos: unknown[][] = [];
  const original = console.error;
  console.error = (...a: unknown[]) => {
    registos.push(a);
  };
  const falha = {
    rpc: () => Promise.resolve({ data: null, error: { code: '42P01', message: mensagemPg } }),
  };
  try {
    const casos: [Rota, string, string][] = [
      [rota('tvde/modelos'), 'tvde/modelos', 'api_tvde_modelos'],
      [rota('tvde/modelos', UUID), `tvde/modelos/${UUID}`, 'api_tvde_modelo'],
      [
        rota('tvde/disponibilidade'),
        `tvde/disponibilidade?inicio=${encodeURIComponent(INICIO)}`,
        'api_tvde_disponibilidade',
      ],
    ];
    for (const [r, caminho] of casos) {
      const resposta = await servirTvde(r, url(caminho), ctx, falha);
      assertEquals(resposta?.status, 500, caminho);
      assertEquals((await resposta!.json()).erro.codigo, 'ERRO_INTERNO');
    }
    assertEquals(registos.length, casos.length);
    casos.forEach(([, , rpc], i) => {
      const linha = JSON.stringify(registos[i]);
      assert(!linha.includes('does not exist'), linha);
      assert(linha.includes('42P01'), linha);
      assert(linha.includes(rpc), linha);
    });
  } finally {
    console.error = original;
  }
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

Deno.test(
  'cartões TVDE (lista, detalhe e disponibilidade) levam a foto assinada sem foto_path',
  async () => {
    const cartao = () => ({ id: UUID, imagem_url: null, foto_path: 'v1/fotos/capa' });
    const esperado = { id: UUID, imagem_url: 'https://s/v1/fotos/capa?t=1' };
    const lista = await servirTvde(rota('tvde/modelos'), url('tvde/modelos'), ctx, {
      ...base('api_tvde_modelos', { p_org_id: 'org1' }, [cartao()]),
      ...armazem,
    });
    assertEquals(await lista?.json(), [esperado]);
    const detalhe = await servirTvde(rota('tvde/modelos', UUID), url(`tvde/modelos/${UUID}`), ctx, {
      ...base('api_tvde_modelo', { p_org_id: 'org1', p_modelo_id: UUID }, cartao()),
      ...armazem,
    });
    assertEquals(await detalhe?.json(), esperado);
    const disp = await servirTvde(
      rota('tvde/disponibilidade'),
      url(`tvde/disponibilidade?inicio=${encodeURIComponent(INICIO)}`),
      ctx,
      {
        ...base(
          'api_tvde_disponibilidade',
          { p_org_id: 'org1', p_inicio: '2026-10-12T08:00:00.000Z' },
          { inicio: 'x', modelos: [{ ...cartao(), quantidade_disponivel: 2 }] }
        ),
        ...armazem,
      }
    );
    assertEquals(await disp?.json(), {
      inicio: 'x',
      modelos: [{ ...esperado, quantidade_disponivel: 2 }],
    });
  }
);
