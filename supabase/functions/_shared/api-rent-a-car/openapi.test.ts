import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { ROTAS_CATALOGO } from './catalogo.ts';
import { OPENAPI, caminhosDocumentados } from './openapi.ts';

Deno.test('toda a rota de catálogo está documentada, e só essas mais health/openapi', () => {
  const doc = new Set(caminhosDocumentados());
  for (const r of ROTAS_CATALOGO) {
    assert(doc.has(`GET /${r.recurso}`), `falta GET /${r.recurso}`);
    if (r.comId) assert(doc.has(`GET /${r.recurso}/{id}`), `falta GET /${r.recurso}/{id}`);
  }
  assert(doc.has('GET /health'));
  assert(doc.has('GET /openapi.json'));
  const esperados = new Set<string>(['GET /health', 'GET /openapi.json']);
  for (const r of ROTAS_CATALOGO) {
    esperados.add(`GET /${r.recurso}`);
    if (r.comId) esperados.add(`GET /${r.recurso}/{id}`);
  }
  assertEquals([...doc].sort(), [...esperados].sort());
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
  assertEquals(paths['/modelos'].get.security, undefined);
});
