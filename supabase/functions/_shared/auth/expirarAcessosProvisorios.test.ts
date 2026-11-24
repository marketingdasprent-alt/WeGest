import { assertEquals, assertFalse } from 'jsr:@std/assert@1.0.19';
import { stub } from 'jsr:@std/testing@1.0.16/mock';
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { handleExpirarAcessos } from '../../expirar-acessos-provisorios/handler.ts';

const KEY = 'service-role-test-key';
const U1 = '11111111-1111-4111-8111-111111111111';
const U2 = '22222222-2222-4222-8222-222222222222';
const U3 = '33333333-3333-4333-8333-333333333333';

interface Call {
  path: string;
  method: string;
  body: Record<string, unknown>;
}

function fixture(
  opcoes: {
    falhaSenhaDe?: string;
    falhaSessoesDe?: string;
    lista?: unknown;
    listaErro?: boolean;
  } = {}
) {
  const calls: Call[] = [];
  const linhas = opcoes.lista ?? [
    { id: 'a1', user_id: U1 },
    { id: 'a2', user_id: U2 },
    { id: 'a3', user_id: U3 },
  ];
  const client = createClient('https://synthetic.test', KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        );
        const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
        calls.push({ path: url.pathname, method: init?.method ?? 'GET', body });
        let data: unknown = null;
        let status = 200;
        if (url.pathname.endsWith('/reclamar_acessos_provisorios_expirados')) {
          data = linhas;
          if (opcoes.listaErro) {
            status = 500;
            data = { message: 'boom' };
          }
        } else if (url.pathname.startsWith('/auth/v1/admin/users/')) {
          const id = url.pathname.split('/').pop();
          data = { id, email: 'x@y.test' };
          if (id === opcoes.falhaSenhaDe) {
            status = 500;
            data = { message: 'falhou' };
          }
        } else if (url.pathname.endsWith('/revogar_sessoes_utilizador')) {
          if (body.p_user_id === opcoes.falhaSessoesDe) {
            status = 500;
            data = { message: 'falhou' };
          }
        }
        return new Response(JSON.stringify(data), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  });
  const req = (token?: string) =>
    new Request('https://synthetic.test', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: '{}',
    });
  return { calls, client, req };
}

for (const token of [undefined, 'anon-key', 'jwt-de-utilizador']) {
  Deno.test(`recusa o token ${token ?? 'ausente'} sem tocar na base`, async () => {
    const f = fixture();
    const r = await handleExpirarAcessos(f.req(token), f.client, KEY);
    assertEquals(r.status, 401);
    assertEquals(f.calls.length, 0);
  });
}

Deno.test('roda a senha e corta as sessões de cada acesso reclamado', async () => {
  const f = fixture();
  const r = await handleExpirarAcessos(f.req(KEY), f.client, KEY);
  assertEquals(r.status, 200);
  assertEquals(await r.json(), { success: true, total: 3, expirados: 3, falhados: 0 });
  assertFalse(f.calls.some((c) => c.path.endsWith('libertar_acesso_provisorio')));
  for (const user of [U1, U2, U3]) {
    const iSenha = f.calls.findIndex(
      (c) => c.path === `/auth/v1/admin/users/${user}` && c.method === 'PUT'
    );
    const iSessoes = f.calls.findIndex(
      (c) => c.path.endsWith('revogar_sessoes_utilizador') && c.body.p_user_id === user
    );
    assertEquals(iSenha >= 0 && iSenha < iSessoes, true, `ordem de ${user}`);
    const senha = f.calls[iSenha].body.password as string;
    assertEquals(senha.length >= 32 && /[a-zA-Z]/.test(senha) && /[0-9]/.test(senha), true);
  }
});

Deno.test('continua depois de uma falha e liberta só a linha cuja rotação falhou', async () => {
  const silencio = stub(console, 'error', () => {});
  try {
    const f = fixture({ falhaSenhaDe: U1, falhaSessoesDe: U2 });
    const r = await handleExpirarAcessos(f.req(KEY), f.client, KEY);
    assertEquals(await r.json(), { success: true, total: 3, expirados: 1, falhados: 2 });
    const libertadas = f.calls
      .filter((c) => c.path.endsWith('libertar_acesso_provisorio'))
      .map((c) => c.body.p_id);
    assertEquals(libertadas, ['a1']);
    assertFalse(
      f.calls.some((c) => c.path.endsWith('revogar_sessoes_utilizador') && c.body.p_user_id === U1)
    );
  } finally {
    silencio.restore();
  }
});

Deno.test('sem linhas expiradas não faz nada', async () => {
  const f = fixture({ lista: [] });
  const r = await handleExpirarAcessos(f.req(KEY), f.client, KEY);
  assertEquals(await r.json(), { success: true, total: 0, expirados: 0, falhados: 0 });
  assertEquals(f.calls.length, 1);
});

Deno.test('500 se a listagem falha', async () => {
  const silencio = stub(console, 'error', () => {});
  try {
    const f = fixture({ listaErro: true });
    assertEquals((await handleExpirarAcessos(f.req(KEY), f.client, KEY)).status, 500);
  } finally {
    silencio.restore();
  }
});
