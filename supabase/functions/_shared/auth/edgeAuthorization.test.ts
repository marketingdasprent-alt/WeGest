import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';

import {
  authenticateUser,
  AuthorizationError,
  isInternalRequest,
  readBearerToken,
  requireInternalRequest,
  requireOrgMember,
  requireOrgAdmin,
  type AuthDependencies,
  type MembershipLookup,
} from './edgeAuthorization.ts';

const requestWithToken = (token?: string) =>
  new Request('https://example.test', {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

function authReturning(user: { id: string } | null): AuthDependencies {
  return {
    getUser: () => Promise.resolve({ user }),
  };
}

Deno.test('readBearerToken extrai um bearer token válido', () => {
  assertEquals(readBearerToken(requestWithToken('user-token')), 'user-token');
});

Deno.test('readBearerToken rejeita headers ausentes ou de outro esquema', () => {
  assertEquals(readBearerToken(requestWithToken()), null);
  assertEquals(
    readBearerToken(
      new Request('https://example.test', { headers: { Authorization: 'Basic abc' } }),
    ),
    null,
  );
});

Deno.test('authenticateUser rejeita um pedido sem bearer token', async () => {
  await assertRejects(
    () => authenticateUser(requestWithToken(), authReturning({ id: 'user-1' })),
    AuthorizationError,
    'Não autenticado',
  );
});

Deno.test('authenticateUser rejeita uma chave anon sem utilizador', async () => {
  await assertRejects(
    () => authenticateUser(requestWithToken('anon-key'), authReturning(null)),
    AuthorizationError,
    'Não autenticado',
  );
});

Deno.test('authenticateUser devolve apenas a identidade validada', async () => {
  const user = await authenticateUser(
    requestWithToken('user-token'),
    authReturning({ id: 'user-1' }),
  );

  assertEquals(user, { id: 'user-1' });
});

Deno.test('requireOrgAdmin rejeita quem não pertence à organização', async () => {
  const lookup: MembershipLookup = () => Promise.resolve(null);

  await assertRejects(
    () => requireOrgAdmin('user-1', 'org-1', lookup),
    AuthorizationError,
    'Sem permissão',
  );
});

Deno.test('requireOrgAdmin rejeita um membro que não é administrador', async () => {
  const lookup: MembershipLookup = () => Promise.resolve({ is_admin: false });

  await assertRejects(
    () => requireOrgAdmin('user-1', 'org-1', lookup),
    AuthorizationError,
    'Sem permissão',
  );
});

Deno.test('requireOrgAdmin aceita o administrador da organização pedida', async () => {
  const calls: Array<[string, string]> = [];
  const lookup: MembershipLookup = (userId, orgId) => {
    calls.push([userId, orgId]);
    return Promise.resolve({ is_admin: true });
  };

  await requireOrgAdmin('user-1', 'org-1', lookup);

  assertEquals(calls, [['user-1', 'org-1']]);
});

Deno.test('requireOrgMember aceita qualquer associação à organização pedida', async () => {
  const lookup: MembershipLookup = () => Promise.resolve({ is_admin: false });

  await requireOrgMember('user-1', 'org-1', lookup);
});

Deno.test('requireOrgMember rejeita utilizador de outra organização', async () => {
  const lookup: MembershipLookup = () => Promise.resolve(null);

  await assertRejects(
    () => requireOrgMember('user-1', 'org-2', lookup),
    AuthorizationError,
    'Sem acesso',
  );
});

Deno.test('chamada interna exige correspondência exata com a service role', async () => {
  assertEquals(isInternalRequest(requestWithToken('service-secret'), 'service-secret'), true);
  assertEquals(isInternalRequest(requestWithToken('service-secret-x'), 'service-secret'), false);
  assertEquals(isInternalRequest(requestWithToken(), 'service-secret'), false);

  assertThrows(
    () => requireInternalRequest(requestWithToken('wrong'), 'service-secret'),
    AuthorizationError,
    'Chamada interna não autorizada',
  );
});
