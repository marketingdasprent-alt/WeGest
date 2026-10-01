import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { servirCatalogo } from './catalogo.ts';

const ctx = { chaveId: 'k1', orgId: 'org1', permissoes: ['catalogo:read'], limitePorMinuto: 120 };

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

Deno.test('GET /modelos chama api_modelos com filtros e cache de 5 minutos', async () => {
  const r = await servirCatalogo(
    { metodo: 'GET', recurso: 'modelos', id: null },
    new URL('https://x/v1/modelos?categoria=g1&tipo=comercial'),
    ctx,
    db('api_modelos', { p_org_id: 'org1', p_categoria: 'g1', p_tipo: 'comercial' }, [{ id: 'm1' }])
  );
  assertEquals(r?.status, 200);
  assertEquals(r?.headers.get('cache-control'), 'public, max-age=300');
  assertEquals(await r?.json(), [{ id: 'm1' }]);
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

Deno.test('GET /modelos/{id} chama api_modelo e devolve o detalhe', async () => {
  const r = await servirCatalogo(
    { metodo: 'GET', recurso: 'modelos', id: 'm1' },
    new URL('https://x/v1/modelos/m1'),
    ctx,
    db('api_modelo', { p_org_id: 'org1', p_modelo_id: 'm1' }, { id: 'm1', tarifa: {} })
  );
  assertEquals(r?.status, 200);
  assertEquals(await r?.json(), { id: 'm1', tarifa: {} });
});

Deno.test('GET /modelos/{id} inexistente → 404', async () => {
  const r = await servirCatalogo(
    { metodo: 'GET', recurso: 'modelos', id: 'zzz' },
    new URL('https://x/v1/modelos/zzz'),
    ctx,
    db('api_modelo', { p_org_id: 'org1', p_modelo_id: 'zzz' }, null)
  );
  assertEquals(r?.status, 404);
  assertEquals((await r?.json()).erro.codigo, 'NAO_ENCONTRADO');
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
    { metodo: 'GET', recurso: 'extras', id: 'e1' },
    new URL('https://x/v1/extras/e1'),
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
