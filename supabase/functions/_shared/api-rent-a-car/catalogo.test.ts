import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { servirCatalogo } from './catalogo.ts';

const ctx = { chaveId: 'k1', orgId: 'org1', permissoes: ['catalogo:read'], limitePorMinuto: 120 };
const UUID = '2b7c0b7e-1111-4222-8333-444455556666';

function db(esperado: string, args: Record<string, unknown>, data: unknown) {
  return {
    rpc(name: string, a: Record<string, unknown>) {
      assertEquals(name, esperado);
      assertEquals(a, args);
      return Promise.resolve({ data, error: null });
    },
  };
}

const semBase = {
  rpc(): Promise<{ data: unknown; error: unknown }> {
    throw new Error('não devia chamar');
  },
};

Deno.test('GET /modelos chama api_modelos com filtros e cache PRIVADA de 5 minutos', async () => {
  const r = await servirCatalogo(
    { metodo: 'GET', recurso: 'modelos', id: null },
    new URL(`https://x/v1/modelos?categoria=${UUID}&tipo=comercial`),
    ctx,
    db('api_modelos', { p_org_id: 'org1', p_categoria: UUID, p_tipo: 'comercial' }, [{ id: 'm1' }])
  );
  assertEquals(r?.status, 200);
  assertEquals(r?.headers.get('cache-control'), 'private, max-age=300');
  assertEquals(r?.headers.get('vary'), 'Origin, X-API-Key, Authorization');
  assertEquals(await r?.json(), [{ id: 'm1', imagem_url: null }]);
});

Deno.test('GET /modelos sem filtros passa null nos dois parâmetros', async () => {
  const r = await servirCatalogo(
    { metodo: 'GET', recurso: 'modelos', id: null },
    new URL('https://x/v1/modelos'),
    ctx,
    db('api_modelos', { p_org_id: 'org1', p_categoria: null, p_tipo: null }, [])
  );
  assertEquals(await r?.json(), []);
});

Deno.test('GET /modelos/{id} chama api_modelo e devolve o detalhe, cache privada', async () => {
  const r = await servirCatalogo(
    { metodo: 'GET', recurso: 'modelos', id: UUID },
    new URL(`https://x/v1/modelos/${UUID}`),
    ctx,
    db('api_modelo', { p_org_id: 'org1', p_modelo_id: UUID }, { id: UUID, tarifa: {} })
  );
  assertEquals(r?.status, 200);
  assertEquals(r?.headers.get('cache-control'), 'private, max-age=300');
  assertEquals(await r?.json(), { id: UUID, tarifa: {}, imagem_url: null });
});

Deno.test('GET /modelos/{id} com UUID inexistente → 404', async () => {
  const r = await servirCatalogo(
    { metodo: 'GET', recurso: 'modelos', id: UUID },
    new URL(`https://x/v1/modelos/${UUID}`),
    ctx,
    db('api_modelo', { p_org_id: 'org1', p_modelo_id: UUID }, null)
  );
  assertEquals(r?.status, 404);
  assertEquals((await r?.json()).erro.codigo, 'NAO_ENCONTRADO');
});

Deno.test('GET /modelos/{id} com id que não é UUID → 404 sem tocar na base', async () => {
  for (const id of ['zzz', '123', UUID.slice(0, -1), UUID + '0']) {
    const r = await servirCatalogo(
      { metodo: 'GET', recurso: 'modelos', id },
      new URL(`https://x/v1/modelos/${id}`),
      ctx,
      semBase
    );
    assertEquals(r?.status, 404);
    assertEquals((await r?.json()).erro.codigo, 'NAO_ENCONTRADO');
  }
});

Deno.test('tipo inválido → 400 PARAMETRO_INVALIDO sem tocar na base', async () => {
  const r = await servirCatalogo(
    { metodo: 'GET', recurso: 'modelos', id: null },
    new URL('https://x/v1/modelos?tipo=aviao'),
    ctx,
    semBase
  );
  assertEquals(r?.status, 400);
  assertEquals((await r?.json()).erro.codigo, 'PARAMETRO_INVALIDO');
});

Deno.test('sem permissão catalogo:read → 403', async () => {
  const r = await servirCatalogo(
    { metodo: 'GET', recurso: 'extras', id: null },
    new URL('https://x/v1/extras'),
    { ...ctx, permissoes: [] },
    semBase
  );
  assertEquals(r?.status, 403);
});

Deno.test('recurso de lista com id → 404, sem tocar na base', async () => {
  const r = await servirCatalogo(
    { metodo: 'GET', recurso: 'extras', id: UUID },
    new URL(`https://x/v1/extras/${UUID}`),
    ctx,
    semBase
  );
  assertEquals(r?.status, 404);
});

Deno.test('erro da base → 500 ERRO_INTERNO sem expor detalhes', async () => {
  const r = await servirCatalogo(
    { metodo: 'GET', recurso: 'coberturas', id: null },
    new URL('https://x/v1/coberturas'),
    ctx,
    { rpc: () => Promise.resolve({ data: null, error: { message: 'relation missing' } }) }
  );
  assertEquals(r?.status, 500);
  assertEquals(await r?.json(), {
    erro: { codigo: 'ERRO_INTERNO', mensagem: 'Falha a ler o catálogo.' },
  });
});

Deno.test('POST num recurso de catálogo devolve null (não é de catálogo)', async () => {
  const r = await servirCatalogo(
    { metodo: 'POST', recurso: 'modelos', id: null },
    new URL('https://x/v1/modelos'),
    ctx,
    semBase
  );
  assertEquals(r, null);
});

Deno.test('recurso que não é de catálogo devolve null', async () => {
  const r = await servirCatalogo(
    { metodo: 'GET', recurso: 'reservas', id: null },
    new URL('https://x/v1/reservas'),
    ctx,
    db('', {}, null)
  );
  assertEquals(r, null);
});

Deno.test('categoria que não é UUID → 400 PARAMETRO_INVALIDO sem tocar na base', async () => {
  const r = await servirCatalogo(
    { metodo: 'GET', recurso: 'modelos', id: null },
    new URL('https://x/v1/modelos?categoria=g1'),
    ctx,
    semBase
  );
  assertEquals(r?.status, 400);
  assertEquals((await r?.json()).erro.codigo, 'PARAMETRO_INVALIDO');
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
  'GET /modelos e /modelos/{id}: imagem_url assinada da viatura, foto_path nunca sai',
  async () => {
    const lista = await servirCatalogo(
      { metodo: 'GET', recurso: 'modelos', id: null },
      new URL('https://x/v1/modelos'),
      ctx,
      {
        ...db('api_modelos', { p_org_id: 'org1', p_categoria: null, p_tipo: null }, [
          { id: 'm1', imagem_url: null, foto_path: 'v1/fotos/capa' },
          { id: 'm2', imagem_url: null, foto_path: null },
        ]),
        ...armazem,
      }
    );
    assertEquals(await lista?.json(), [
      { id: 'm1', imagem_url: 'https://s/v1/fotos/capa?t=1' },
      { id: 'm2', imagem_url: null },
    ]);
    const detalhe = await servirCatalogo(
      { metodo: 'GET', recurso: 'modelos', id: UUID },
      new URL(`https://x/v1/modelos/${UUID}`),
      ctx,
      {
        ...db(
          'api_modelo',
          { p_org_id: 'org1', p_modelo_id: UUID },
          {
            id: UUID,
            imagem_url: null,
            foto_path: 'v1/fotos/capa',
          }
        ),
        ...armazem,
      }
    );
    assertEquals(await detalhe?.json(), { id: UUID, imagem_url: 'https://s/v1/fotos/capa?t=1' });
  }
);

Deno.test('GET /categorias mantém a imagem da categoria', async () => {
  const r = await servirCatalogo(
    { metodo: 'GET', recurso: 'categorias', id: null },
    new URL('https://x/v1/categorias'),
    ctx,
    {
      ...db('api_categorias', { p_org_id: 'org1' }, [{ id: 'g1', imagem_url: 'https://cat.webp' }]),
      ...armazem,
    }
  );
  assertEquals(await r?.json(), [{ id: 'g1', imagem_url: 'https://cat.webp' }]);
});
