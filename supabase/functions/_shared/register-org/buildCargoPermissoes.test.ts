// supabase/functions/_shared/register-org/buildCargoPermissoes.test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildCargoPermissoes } from './buildCargoPermissoes.ts';

const CARGO_ID = 'cargo-1';
const ORG_ID = 'org-1';

Deno.test('regressão 14–20/07: toda linha gerada tem org_id preenchido', () => {
  const recursos = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }];
  const rows = buildCargoPermissoes(CARGO_ID, ORG_ID, recursos);
  assert(rows.length > 0);
  for (const row of rows) {
    assertEquals(row.org_id, ORG_ID);
  }
});

Deno.test('gera exactamente uma linha por recurso, sem duplicar nem perder', () => {
  const recursos = [{ id: 'r1' }, { id: 'r2' }];
  const rows = buildCargoPermissoes(CARGO_ID, ORG_ID, recursos);
  assertEquals(rows.length, 2);
  assertEquals(
    rows.map((r) => r.recurso_id),
    ['r1', 'r2']
  );
});

Deno.test('cada linha aponta para o cargo admin recebido, com acesso total', () => {
  const rows = buildCargoPermissoes(CARGO_ID, ORG_ID, [{ id: 'r1' }]);
  assertEquals(rows[0].cargo_id, CARGO_ID);
  assertEquals(rows[0].tem_acesso, true);
  assertEquals(rows[0].pode_editar, true);
});

Deno.test('lista de recursos vazia → nenhuma linha (não gera lixo)', () => {
  const rows = buildCargoPermissoes(CARGO_ID, ORG_ID, []);
  assertEquals(rows.length, 0);
});
