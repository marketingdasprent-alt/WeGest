import { assertEquals, assertFalse } from 'jsr:@std/assert@1.0.19';
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { handleCreateUser } from '../../create-user/handler.ts';
import { handlePasswordRecovery } from '../../reset-user-password/handler.ts';

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CARGO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
interface Call { path: string; method: string; body: Record<string, unknown> }

function fixture(options: { admin?: boolean; member?: boolean; existing?: boolean; cargoOrg?: string; cargoNome?: string; authValid?: boolean; mailFailure?: boolean } = {}) {
  const calls: Call[] = [];
  const client = createClient('https://synthetic.test', 'synthetic-service-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
      calls.push({ path: url.pathname + url.search, method: init?.method ?? 'GET', body });
      let data: unknown = null;
      let status = 200;
      if (url.pathname === '/auth/v1/user') {
        data = options.authValid === false ? { message: 'Invalid JWT' } : { id: 'admin-a', email: 'admin@a.test' };
        if (options.authValid === false) status = 401;
      } else if (url.pathname === '/auth/v1/admin/users' && init?.method === 'POST') {
        data = options.existing ? { code: 'email_exists', msg: 'A user with this email address has already been registered' } : { id: TARGET, email: 'owner@b.test' };
        if (options.existing) status = 422;
      } else if (url.pathname === `/auth/v1/admin/users/${TARGET}`) {
        data = { id: TARGET, email: 'owner@b.test' };
      } else if (url.pathname === '/rest/v1/user_organizacoes') {
        data = url.searchParams.get('user_id') === 'eq.admin-a'
          ? { is_admin: options.admin !== false }
          : options.member === false ? null : { is_admin: false };
      } else if (url.pathname === '/rest/v1/cargos') {
        data = { id: CARGO, nome: options.cargoNome ?? 'Gestor', org_id: options.cargoOrg ?? ORG_A };
      } else if (url.pathname === '/rest/v1/convites') {
        data = init?.method === 'POST' ? { token: 'convite-sintetico', expires_at: '2026-10-02T00:00:00Z' } : null;
      } else if (url.pathname === '/functions/v1/send-brevo-email') {
        data = options.mailFailure ? { error: 'Falha' } : { success: true, secretLink: 'must-not-leak' };
        if (options.mailFailure) status = 500;
      }
      return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const request = (body: Record<string, unknown>) => new Request('https://synthetic.test', {
    method: 'POST', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { calls, client, request };
}

Deno.test('recovery valida sessão no Auth e rejeita JWT não verificado', async () => {
  const f = fixture({ authValid: false });
  const response = await handlePasswordRecovery(f.request({ userId: TARGET, org_id: ORG_A }), f.client);
  assertEquals(response.status, 401);
  assertEquals(f.calls.length, 1);
});

for (const options of [{ admin: false }, { member: false }]) {
  Deno.test(`recovery rejeita caller/alvo fora da organização ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    const response = await handlePasswordRecovery(f.request({ userId: TARGET, org_id: ORG_A }), f.client);
    assertEquals(response.status, 403);
    assertFalse(f.calls.some((call) => call.path.startsWith('/auth/v1/admin/') || call.path.startsWith('/functions/')));
  });
}

Deno.test('admin A só solicita recuperação no email Auth do titular B, sem alterar identidade', async () => {
  const f = fixture();
  const response = await handlePasswordRecovery(f.request({ userId: TARGET, org_id: ORG_A }), f.client);
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { success: true });
  const sends = f.calls.filter((call) => call.path.startsWith('/functions/'));
  assertEquals(sends.map((call) => call.body), [{ to: 'owner@b.test', type: 'password_recovery' }]);
  assertFalse(f.calls.some((call) => call.method === 'PUT' || call.method === 'PATCH'));
});

Deno.test('recovery não aceita senha nem destinatário do administrador', async () => {
  const f = fixture();
  assertEquals((await handlePasswordRecovery(f.request({ userId: TARGET, org_id: ORG_A, newPassword: 'chosen', email: 'attacker@a.test' }), f.client)).status, 400);
  assertFalse(f.calls.some((call) => call.path.startsWith('/functions/')));
});

Deno.test('recovery propaga falha de entrega sem afirmar sucesso', async () => {
  const f = fixture({ mailFailure: true });
  assertEquals((await handlePasswordRecovery(f.request({ userId: TARGET, org_id: ORG_A }), f.client)).status, 500);
});

Deno.test('conta existente recebe convite pendente sem membership nem mutação global', async () => {
  const f = fixture({ existing: true });
  const response = await handleCreateUser(f.request({ nome: 'Nome escolhido por A', email: 'OWNER@B.TEST', password: 'NewChosen123!', cargo_id: CARGO, org_id: ORG_A }), f.client);
  assertEquals(response.status, 200);
  const result = await response.json();
  assertEquals(result.status, 'invited');
  assertEquals(result.invite.token, 'convite-sintetico');
  assertFalse(f.calls.some((call) => ['PUT', 'PATCH', 'POST'].includes(call.method) && /rest\/v1\/(profiles|user_organizacoes|user_org_ativa)/.test(call.path)));
  const invite = f.calls.find((call) => call.path.startsWith('/rest/v1/convites') && call.method === 'POST');
  assertEquals(invite?.body.email, 'owner@b.test');
  assertEquals(invite?.body.org_id, ORG_A);
});

Deno.test('cargo de outra organização é rejeitado antes de criar conta ou convite', async () => {
  const f = fixture({ cargoOrg: 'outra-org' });
  assertEquals((await handleCreateUser(f.request({ nome: 'Titular', email: 'owner@b.test', password: 'Strong123!', cargo_id: CARGO, org_id: ORG_A }), f.client)).status, 400);
  assertFalse(f.calls.some((call) => call.method === 'POST'));
});

Deno.test('preserva criação nova com org/cargo no app_metadata e não repete membership do trigger', async () => {
  const f = fixture();
  const response = await handleCreateUser(f.request({ nome: 'Titular', email: 'new@a.test', password: 'Strong123!', cargo_id: CARGO, org_id: ORG_A }), f.client);
  assertEquals(response.status, 200);
  assertEquals((await response.json()).status, 'created');
  const create = f.calls.find((call) => call.path === '/auth/v1/admin/users');
  assertEquals(create?.body.app_metadata, { org_id: ORG_A, cargo_id: CARGO, tipo_utilizador: 'colaborador' });
  assertFalse(f.calls.some((call) => call.path.startsWith('/rest/v1/user_organizacoes') && call.method === 'POST'));
});

// O trigger grava profiles.is_admin = false; a política de convites lê esse
// campo, e um colega criado como Administrador deixava de poder convidar.
for (const [cargoNome, esperado] of [['Administrador', true], ['Gestor', false]] as const) {
  Deno.test(`conta nova com grupo ${cargoNome} fica com profiles.is_admin = ${esperado}`, async () => {
    const f = fixture({ cargoNome });
    const response = await handleCreateUser(f.request({ nome: 'Titular', email: 'new@a.test', password: 'Strong123!', cargo_id: CARGO, org_id: ORG_A }), f.client);
    assertEquals(response.status, 200);
    const perfil = f.calls.find((call) => call.path.startsWith('/rest/v1/profiles') && call.method === 'PATCH');
    assertEquals(perfil?.path.includes(`id=eq.${TARGET}`), true);
    assertEquals(perfil?.body, { is_admin: esperado });
  });
}
