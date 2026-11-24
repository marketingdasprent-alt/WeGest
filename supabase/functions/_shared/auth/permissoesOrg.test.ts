import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1.0.19';
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { lookupPermissoesOrg } from './permissoesOrg.ts';

interface Opcoes {
  membro?: Record<string, unknown> | null;
  grupos?: unknown;
  perms?: unknown;
  falha?: 'membro' | 'grupos' | 'perms';
}

function fixture(o: Opcoes) {
  const paths: string[] = [];
  const client = createClient('https://synthetic.test', 'synthetic-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input) => {
        const url = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        );
        paths.push(url.pathname + url.search);
        let data: unknown = null;
        let status = 200;
        if (url.pathname === '/rest/v1/user_organizacoes') {
          data = o.membro ?? null;
          if (o.falha === 'membro') [status, data] = [500, { message: 'boom' }];
        } else if (url.pathname === '/rest/v1/rpc/cargo_ids_do_utilizador') {
          data = o.grupos ?? [];
          if (o.falha === 'grupos') [status, data] = [500, { message: 'boom' }];
        } else if (url.pathname === '/rest/v1/cargo_permissoes') {
          data = o.perms ?? [];
          if (o.falha === 'perms') [status, data] = [500, { message: 'boom' }];
        }
        return new Response(JSON.stringify(data), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  });
  return { client, paths, lookup: lookupPermissoesOrg(client) };
}

Deno.test('sem membership devolve null (caso normal, não erro)', async () => {
  assertEquals(await fixture({ membro: null }).lookup('u', 'o'), null);
});

Deno.test('admin e membro sem cargo não consultam permissões', async () => {
  const a = fixture({ membro: { is_admin: true, cargo_id: 'c1' } });
  assertEquals(await a.lookup('u', 'o'), { is_admin: true, recursos: [] });
  assertEquals(a.paths.length, 1);
  const b = fixture({ membro: { is_admin: false, cargo_id: null } });
  assertEquals(await b.lookup('u', 'o'), { is_admin: false, recursos: [] });
});

Deno.test('junta os recursos de todos os grupos da pessoa (embed objecto ou lista)', async () => {
  const f = fixture({
    membro: { is_admin: false, cargo_id: 'c1' },
    grupos: ['c1', 'c2'],
    perms: [{ recursos: { nome: 'a' } }, { recursos: [{ nome: 'b' }] }, { recursos: null }],
  });
  assertEquals(await f.lookup('u', 'o'), { is_admin: false, recursos: ['a', 'b'] });
  const consulta = f.paths.find((p) => p.startsWith('/rest/v1/cargo_permissoes'))!;
  assertStringIncludes(decodeURIComponent(consulta), 'cargo_id=in.(c1,c2)');
});

Deno.test('sem grupos devolvidos usa o cargo_id do membro', async () => {
  const f = fixture({
    membro: { is_admin: false, cargo_id: 'c9' },
    grupos: [],
    perms: [{ recursos: { nome: 'x' } }],
  });
  assertEquals((await f.lookup('u', 'o'))?.recursos, ['x']);
  assertStringIncludes(
    decodeURIComponent(f.paths.find((p) => p.includes('cargo_permissoes'))!),
    'cargo_id=in.(c9)'
  );
});

for (const falha of ['membro', 'grupos', 'perms'] as const) {
  Deno.test(`erro de base de dados em ${falha} rebenta em vez de negar em silêncio`, async () => {
    const f = fixture({ membro: { is_admin: false, cargo_id: 'c1' }, falha });
    let rebentou = false;
    try {
      await f.lookup('u', 'o');
    } catch {
      rebentou = true;
    }
    assertEquals(rebentou, true);
  });
}
