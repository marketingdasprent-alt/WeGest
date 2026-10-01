// Autenticação por chave da API externa de rent-a-car. A chave em claro só
// circula no cabeçalho; a base guarda o sha256 e resolve-o por api_chave_por_hash.
import { trustedRequestIp } from '../rate-limit/rateLimit.ts';
import { erro } from './respostas.ts';

export interface ContextoApi {
  chaveId: string;
  orgId: string;
  permissoes: string[];
  limitePorMinuto: number;
}

/** Chave que existe na base mas foi recusada: vai para a auditoria. */
export interface ChaveRecusada {
  id: string;
  orgId: string;
}

/** Recusa (401/403). `chave` só quando a linha existe (403), nunca no 401. */
export interface Recusa {
  recusa: Response;
  chave?: ChaveRecusada;
}

export interface DbRpc {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}

interface LinhaChave {
  id: string;
  org_id: string;
  escopo: string;
  permissoes: string[] | null;
  ativo: boolean;
  ip_whitelist: string[] | null;
  rate_limit_per_minute: number | null;
  expires_at: string | null;
}

const PREFIXO_CHAVE = 'wg_ra_';
const LIMITE_POR_OMISSAO = 120;

export function readApiKey(req: Request): string | null {
  const directo = req.headers.get('x-api-key')?.trim();
  if (directo) return directo;
  const auth = req.headers.get('authorization') ?? '';
  const m = /^(?:Bearer|ApiKey)\s+(\S+)$/i.exec(auth);
  return m ? m[1] : null;
}

export async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Devolve o contexto da chave ou a Recusa (401/403) com a chave recusada, se existir. */
export async function autenticar(req: Request, db: DbRpc): Promise<ContextoApi | Recusa> {
  const chave = readApiKey(req);
  if (!chave || !chave.startsWith(PREFIXO_CHAVE)) {
    return {
      recusa: erro(
        'NAO_AUTENTICADO',
        'Chave de API em falta ou inválida. Use o cabeçalho X-API-Key.',
        401
      ),
    };
  }
  const { data, error } = await db.rpc('api_chave_por_hash', { p_hash: await sha256Hex(chave) });
  const linha = (Array.isArray(data) ? data[0] : data) as LinhaChave | undefined;
  if (error) {
    // Base em baixo ou migração por aplicar: não é a chave que está mal.
    console.error(
      '[api-rent-a-car] api_chave_por_hash falhou:',
      (error as { message?: string }).message
    );
    return { recusa: erro('ERRO_INTERNO', 'Serviço temporariamente indisponível.', 503) };
  }
  if (!linha) return { recusa: erro('NAO_AUTENTICADO', 'Chave de API desconhecida.', 401) };

  const recusada = (mensagem: string): Recusa => ({
    recusa: erro('SEM_PERMISSAO', mensagem, 403),
    chave: { id: linha.id, orgId: linha.org_id },
  });
  if (linha.escopo !== 'rent_a_car') return recusada('Esta chave não serve a API de rent-a-car.');
  if (!linha.ativo) return recusada('Chave desactivada.');
  if (linha.expires_at && new Date(linha.expires_at) < new Date()) {
    return recusada('Chave expirada.');
  }
  // trustedRequestIp: cf-connecting-ip (posto pelo gateway) antes do ÚLTIMO valor de
  // x-forwarded-for; o primeiro valor é escolhido pelo cliente e não vale nada.
  const whitelist = linha.ip_whitelist ?? [];
  if (whitelist.length > 0 && !whitelist.includes(trustedRequestIp(req))) {
    return recusada('Origem não autorizada para esta chave.');
  }
  return {
    chaveId: linha.id,
    orgId: linha.org_id,
    permissoes: linha.permissoes ?? [],
    limitePorMinuto: linha.rate_limit_per_minute ?? LIMITE_POR_OMISSAO,
  };
}

export function exigirPermissao(ctx: ContextoApi, permissao: string): Response | null {
  return ctx.permissoes.includes(permissao)
    ? null
    : erro('SEM_PERMISSAO', `A chave não tem a permissão ${permissao}.`, 403);
}
