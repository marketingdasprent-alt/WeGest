export interface AuthenticatedUser {
  id: string;
}

interface GetUserResult {
  user: AuthenticatedUser | null;
}

export interface AuthDependencies {
  getUser: (token: string) => Promise<GetUserResult>;
}

export interface OrgMembership {
  is_admin: boolean;
}

export type MembershipLookup = (
  userId: string,
  orgId: string,
) => Promise<OrgMembership | null>;

export class AuthorizationError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export function readBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization')?.trim();
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

export async function authenticateUser(
  req: Request,
  dependencies: AuthDependencies,
): Promise<AuthenticatedUser> {
  const token = readBearerToken(req);
  if (!token) throw new AuthorizationError('Não autenticado', 401);

  try {
    const { user } = await dependencies.getUser(token);
    if (!user) throw new AuthorizationError('Não autenticado', 401);
    return { id: user.id };
  } catch (error) {
    if (error instanceof AuthorizationError) throw error;
    throw new AuthorizationError('Não autenticado', 401);
  }
}

export async function requireOrgAdmin(
  userId: string,
  orgId: string,
  lookup: MembershipLookup,
): Promise<void> {
  const membership = await lookup(userId, orgId);
  if (!membership?.is_admin) {
    throw new AuthorizationError('Sem permissão nesta organização', 403);
  }
}

export async function requireOrgMember(
  userId: string,
  orgId: string,
  lookup: MembershipLookup,
): Promise<void> {
  const membership = await lookup(userId, orgId);
  if (!membership) throw new AuthorizationError('Sem acesso a esta organização', 403);
}

export function isInternalRequest(req: Request, serviceRoleKey: string): boolean {
  const token = readBearerToken(req);
  return Boolean(serviceRoleKey && token && token === serviceRoleKey);
}

export function requireInternalRequest(req: Request, serviceRoleKey: string): void {
  if (!isInternalRequest(req, serviceRoleKey)) {
    throw new AuthorizationError('Chamada interna não autorizada', 401);
  }
}
