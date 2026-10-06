// Contrato da especificação: o site docs.wegest.pt gera páginas, tabelas e
// exemplos a partir daqui, por isso cada operação, parâmetro e resposta tem de
// trazer o que a documentação precisa.
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { ROTAS_CATALOGO } from './catalogo.ts';
import { OPENAPI, PERMISSOES_ESPECIAIS } from './openapi.ts';
import { ROTAS_TVDE } from './tvde.ts';

type Op = {
  'x-permissao'?: string;
  parameters?: { name: string; description?: string; example?: unknown }[];
  responses: Record<string, { $ref?: string; content?: Record<string, { example?: unknown }> }>;
};
// deno-lint-ignore no-explicit-any
const paths = OPENAPI.paths as Record<string, Record<string, Op>>;
// deno-lint-ignore no-explicit-any
const comp = OPENAPI.components as Record<string, Record<string, any>>;
const operacoes = Object.entries(paths).flatMap(([caminho, ops]) =>
  Object.entries(ops).map(([metodo, op]) => ({ id: `${metodo.toUpperCase()} ${caminho}`, op }))
);

Deno.test('todas as operações têm x-permissao, e a do catálogo bate com o router', () => {
  for (const { id, op } of operacoes) {
    const p = op['x-permissao'];
    assert(p, `${id} sem x-permissao`);
    assert(
      (PERMISSOES_ESPECIAIS as readonly string[]).includes(p) ||
        /^(tvde:)?[a-z]+:(read|write)$/.test(p),
      `${id}: x-permissao estranha "${p}"`
    );
  }
  for (const r of [...ROTAS_CATALOGO, ...ROTAS_TVDE]) {
    assertEquals(paths[`/${r.recurso}`].get['x-permissao'], r.permissao, r.recurso);
    if (r.comId) assertEquals(paths[`/${r.recurso}/{id}`].get['x-permissao'], r.permissao);
  }
});

Deno.test('todos os parâmetros têm description e example', () => {
  for (const { id, op } of operacoes) {
    for (const p of op.parameters ?? []) {
      assert(p.description, `${id}: parâmetro ${p.name} sem description`);
      assert(p.example !== undefined, `${id}: parâmetro ${p.name} sem example`);
    }
  }
});

Deno.test('todas as respostas 200 trazem example', () => {
  for (const { id, op } of operacoes) {
    const r200 = op.responses['200'];
    assert(r200, `${id} sem 200`);
    const json = r200.content?.['application/json'];
    assert(json?.example !== undefined, `${id}: 200 sem example`);
  }
});

Deno.test('todos os esquemas e respostas de erro trazem example', () => {
  for (const [nome, s] of Object.entries(comp.schemas)) {
    assert(s.example !== undefined, `esquema ${nome} sem example`);
  }
  for (const [nome, r] of Object.entries(comp.responses)) {
    assert(r.content['application/json'].example?.erro?.codigo, `resposta ${nome} sem example`);
  }
});

Deno.test('ERRO_INTERNO 503 documentado e presente em todas as operações com chave', () => {
  assertEquals(
    comp.responses.Indisponivel.content['application/json'].example.erro.codigo,
    'ERRO_INTERNO'
  );
  for (const { id, op } of operacoes) {
    if (op['x-permissao'] === 'publica') continue;
    assertEquals(op.responses['503']?.$ref, '#/components/responses/Indisponivel', id);
  }
});

Deno.test('os exemplos de dinheiro seguem a regra { sem_iva, com_iva, iva } com IVA a 23%', () => {
  const p = comp.schemas.Preco.example;
  assertEquals(p, { sem_iva: 35, com_iva: 43.05, iva: 23 });
  assertEquals(Math.round(p.sem_iva * (1 + p.iva / 100) * 100) / 100, p.com_iva);
});
