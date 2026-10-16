// Sessão Supabase Auth da pessoa (cliente ou motorista) que o site manda junto com a chave.
// O Authorization já é da chave de API: o access_token vem em X-Conta-Token ou, por
// compatibilidade com as candidaturas TVDE, em X-Motorista-Token.
// Nunca registar o token, o user nem o email nos logs.
import { erro } from './respostas.ts';

/** Por ordem de preferência: com os dois, vale o X-Conta-Token. */
export const CABECALHOS_TOKEN = ['x-conta-token', 'x-motorista-token'] as const;
const TOKEN_MAXIMO = 4096;
const JWT = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

/** O pedaço do cliente supabase-js (service_role) que confirma a sessão no GoTrue. */
export interface VerificadorSessao {
  auth: {
    getUser(jwt: string): PromiseLike<{ data: { user: { id: string } | null }; error: unknown }>;
  };
}

export const sessaoInvalida = () =>
  erro('SESSAO_INVALIDA', 'Sessão inválida ou expirada. Volte a entrar.', 401);

/**
 * O token do pedido: null sem cabeçalho (ou só com espaços), recusa quando nem tem forma
 * de JWT. Só a forma: a sessão confirma-se em confirmarSessao.
 */
export function lerTokenSessao(
  req: Request,
  recusa: () => Response = sessaoInvalida
): { token: string | null } | { recusa: Response } {
  for (const nome of CABECALHOS_TOKEN) {
    const token = req.headers.get(nome)?.trim();
    if (!token) continue;
    if (token.length > TOKEN_MAXIMO || !JWT.test(token)) return { recusa: recusa() };
    return { token };
  }
  return { token: null };
}

/** O id da conta dona do token, validado no GoTrue (assinatura e sessão), ou a recusa. */
export async function confirmarSessao(
  db: VerificadorSessao,
  token: string,
  recusa: () => Response = sessaoInvalida
): Promise<{ userId: string } | { recusa: Response }> {
  // O erro do GoTrue pode citar o email: nunca vai para o log.
  const { data, error } = await db.auth.getUser(token);
  // GoTrue em baixo ou a limitar (sem status, 0, 429 ou 5xx) não é culpa do token: 503.
  const status = (error as { status?: unknown } | null)?.status;
  if (error && (typeof status !== 'number' || status === 0 || status === 429 || status >= 500)) {
    return {
      recusa: erro('ERRO_INTERNO', 'Serviço de contas temporariamente indisponível.', 503),
    };
  }
  const id = data?.user?.id;
  if (error || !id) return { recusa: recusa() };
  return { userId: id };
}
