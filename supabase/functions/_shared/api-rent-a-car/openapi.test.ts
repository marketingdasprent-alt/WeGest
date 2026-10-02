import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { ROTAS_CATALOGO } from './catalogo.ts';
import { ROTAS_DISPONIBILIDADE } from './disponibilidade.ts';
import { OPENAPI, caminhosDocumentados } from './openapi.ts';
import { ROTAS_RESERVAS } from './reservas.ts';

Deno.test(
  'toda a rota de catálogo e disponibilidade está documentada, e só essas mais health/openapi',
  () => {
    const doc = new Set(caminhosDocumentados());
    for (const r of ROTAS_CATALOGO) {
      assert(doc.has(`GET /${r.recurso}`), `falta GET /${r.recurso}`);
      if (r.comId) assert(doc.has(`GET /${r.recurso}/{id}`), `falta GET /${r.recurso}/{id}`);
    }
    assert(doc.has('GET /health'));
    assert(doc.has('GET /openapi.json'));
    const esperados = new Set<string>(['GET /', 'GET /health', 'GET /openapi.json']);
    for (const r of ROTAS_CATALOGO) {
      esperados.add(`GET /${r.recurso}`);
      if (r.comId) esperados.add(`GET /${r.recurso}/{id}`);
    }
    for (const r of ROTAS_DISPONIBILIDADE) esperados.add(`${r.metodo} /${r.recurso}`);
    for (const r of ROTAS_RESERVAS) {
      esperados.add(`${r.metodo} /reservas${r.comCodigo ? '/{codigo}' : ''}`);
    }
    assertEquals([...doc].sort(), [...esperados].sort());
  }
);

Deno.test('disponibilidade e cotações documentadas com x-permissao, exemplos e erros', () => {
  const doc = new Set(caminhosDocumentados());
  for (const r of ROTAS_DISPONIBILIDADE) {
    assert(doc.has(`${r.metodo} /${r.recurso}`), `falta ${r.metodo} /${r.recurso}`);
  }
  // deno-lint-ignore no-explicit-any
  const paths = OPENAPI.paths as Record<string, Record<string, any>>;
  for (const r of ROTAS_DISPONIBILIDADE) {
    assertEquals(paths[`/${r.recurso}`][r.metodo.toLowerCase()]['x-permissao'], r.permissao);
  }
  const disp = paths['/disponibilidade'].get;
  const cot = paths['/cotacoes'].post;
  assert(cot.requestBody.content['application/json'].example, 'cotação sem exemplo de pedido');
  assert(cot.responses['200'].content['application/json'].example, 'cotação sem exemplo');
  assert(disp.responses['200'].content['application/json'].example, 'disponibilidade sem exemplo');
  for (const op of [disp, cot]) {
    for (const codigo of ['200', '400', '401', '403', '404', '409', '429', '503']) {
      assert(op.responses[codigo], `${op.summary}: sem resposta ${codigo}`);
    }
  }
  // deno-lint-ignore no-explicit-any
  const parametros = disp.parameters as any[];
  assertEquals(
    parametros
      .filter((p) => p.required)
      .map((p) => p.name)
      .sort(),
    ['entrega', 'fim', 'inicio', 'recolha']
  );
  for (const p of parametros) assert(p.description, `parâmetro ${p.name} sem description`);
  assertEquals(
    cot.responses['409'].content['application/json'].example.erro.codigo,
    'SEM_DISPONIBILIDADE'
  );
});

Deno.test('reservas documentadas com a permissão do router, 201/200 no POST e 409', () => {
  // deno-lint-ignore no-explicit-any
  const paths = OPENAPI.paths as Record<string, Record<string, any>>;
  for (const r of ROTAS_RESERVAS) {
    const op = paths[`/reservas${r.comCodigo ? '/{codigo}' : ''}`][r.metodo.toLowerCase()];
    assertEquals(op['x-permissao'], r.permissao);
    // O GET só lê: não tem 409. Criar e cancelar têm.
    if (r.metodo !== 'GET') assert(op.responses['409'], `${r.metodo}: sem 409`);
  }
  const post = paths['/reservas'].post;
  assert(post.responses['201'].content['application/json'].example);
  assert(post.responses['200'], 'POST sem 200 (reserva repetida)');
});

Deno.test('documento declara a segurança por X-API-Key e o envelope de erro', () => {
  // deno-lint-ignore no-explicit-any
  const comp = OPENAPI.components as Record<string, any>;
  assertEquals(comp.securitySchemes.ApiKey, { type: 'apiKey', in: 'header', name: 'X-API-Key' });
  assertEquals(Object.keys(comp.schemas.Erro.properties), ['erro']);
  assertEquals(OPENAPI.openapi, '3.1.0');
  assertEquals(OPENAPI.security, [{ ApiKey: [] }]);
});

Deno.test('todas as referências $ref apontam para componentes que existem', () => {
  // deno-lint-ignore no-explicit-any
  const comp = OPENAPI.components as Record<string, Record<string, any>>;
  const refs: string[] = [];
  const visitar = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visitar);
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (k === '$ref' && typeof x === 'string') refs.push(x);
        else visitar(x);
      }
    }
  };
  visitar(OPENAPI);
  assert(refs.length > 0);
  for (const ref of refs) {
    const m = /^#\/components\/(schemas|responses)\/(\w+)$/.exec(ref);
    assert(m, `ref fora de components: ${ref}`);
    assert(comp[m[1]][m[2]], `componente em falta: ${ref}`);
  }
});

Deno.test('openapi.json é público: sem segurança; o resto herda ApiKey', () => {
  // deno-lint-ignore no-explicit-any
  const paths = OPENAPI.paths as Record<string, any>;
  assertEquals(paths['/openapi.json'].get.security, []);
  assertEquals(paths['/'].get.security, []);
  assertEquals(paths['/modelos'].get.security, undefined);
});

Deno.test('servidor principal é api.wegest.pt/v1; o URL directo do Supabase vem em segundo', () => {
  const servers = OPENAPI.servers as { url: string; description?: string }[];
  assertEquals(servers[0].url, 'https://api.wegest.pt/v1');
  assertEquals(
    servers[1].url,
    'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/api-rent-a-car/v1'
  );
  assertEquals(servers[1].description, 'directo');
  assertEquals(servers.length, 2);
});
