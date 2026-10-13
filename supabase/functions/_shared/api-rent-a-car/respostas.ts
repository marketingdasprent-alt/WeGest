// Respostas da API externa de rent-a-car: um envelope de erro, CORS só para as
// origens da página de documentação, cache opcional para o catálogo.
import type { RateLimitDecision } from '../rate-limit/rateLimit.ts';

/** Origens que podem ler a API no browser (documentação: /api/docs e docs.wegest.pt). */
const ORIGENS_PERMITIDAS: ReadonlySet<string> = new Set([
  'https://wegest.pt',
  'https://www.wegest.pt',
  'https://docs.wegest.pt',
]);

/** Cabeçalhos CORS fixos. O Allow-Origin é posto por comCors, conforme o Origin do pedido. */
export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Headers': 'x-api-key, authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  // O Allow-Origin varia com o Origin do pedido, também no preflight (OPTIONS).
  Vary: 'Origin',
};

// As respostas autenticadas dependem da chave (organização): uma cache partilhada
// tem de as separar por X-API-Key/Authorization, e só o cliente as pode guardar.
const VARY_PRIVADO = 'Origin, X-API-Key, Authorization';

export type CodigoErro =
  | 'NAO_AUTENTICADO'
  | 'SEM_PERMISSAO'
  | 'CORPO_INVALIDO'
  | 'PARAMETRO_INVALIDO'
  | 'NAO_ENCONTRADO'
  | 'PERIODO_INVALIDO'
  | 'PERIODO_EXCEDE_MAXIMO'
  | 'TARIFA_INDISPONIVEL'
  | 'SEM_DISPONIBILIDADE'
  | 'PRECO_ALTERADO'
  | 'CONFIG_EM_FALTA'
  | 'LIMITE_EXCEDIDO'
  | 'ESTADO_INVALIDO'
  | 'CANDIDATURA_EXISTENTE'
  | 'ERRO_INTERNO';

/** A origem do pedido, se estiver na allowlist; senão null (nenhum Allow-Origin). */
export function origemPermitida(req: Request): string | null {
  const origem = req.headers.get('origin');
  return origem && ORIGENS_PERMITIDAS.has(origem) ? origem : null;
}

/** Acrescenta o Access-Control-Allow-Origin da origem permitida, se houver. */
export function comCors(req: Request, resposta: Response): Response {
  const origem = origemPermitida(req);
  if (origem) resposta.headers.set('Access-Control-Allow-Origin', origem);
  return resposta;
}

/**
 * Resposta JSON. Com cacheSeconds é `private` e varia por chave (o catálogo é por
 * organização); só `publico: true` (openapi.json) pode ir para caches partilhadas.
 * `semCache: true` (disponibilidade, cotação) proíbe qualquer cache: muda de minuto a minuto.
 */
export function ok(
  body: unknown,
  init: { status?: number; cacheSeconds?: number; publico?: boolean; semCache?: boolean } = {}
): Response {
  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    Vary: 'Origin',
    'Content-Type': 'application/json',
  };
  if (init.semCache) {
    headers['Cache-Control'] = 'no-store';
  } else if (init.cacheSeconds) {
    const tipo = init.publico ? 'public' : 'private';
    headers['Cache-Control'] = `${tipo}, max-age=${init.cacheSeconds}`;
    if (!init.publico) headers.Vary = VARY_PRIVADO;
  }
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

export function erro(
  codigo: CodigoErro,
  mensagem: string,
  status: number,
  detalhes?: unknown,
  cabecalhos: Record<string, string> = {}
): Response {
  const corpo = {
    erro: detalhes === undefined ? { codigo, mensagem } : { codigo, mensagem, detalhes },
  };
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      ...CORS_HEADERS,
      Vary: 'Origin',
      ...cabecalhos,
      'Content-Type': 'application/json',
    },
  });
}

/**
 * O helper partilhado de rate limit responde `{ success, error }`; esta API fala
 * sempre `{ erro }`. Traduz a decisão e mantém o Retry-After visível ao browser.
 */
export function respostaLimite(
  decisao: RateLimitDecision,
  mensagem = 'Limite de pedidos por minuto excedido.'
): Response | null {
  if (decisao.allowed) return null;
  const cabecalhos = {
    'Retry-After': String(decisao.retryAfter),
    'Access-Control-Expose-Headers': 'Retry-After',
  };
  return decisao.status === 429
    ? erro('LIMITE_EXCEDIDO', mensagem, 429, undefined, cabecalhos)
    : erro(
        'ERRO_INTERNO',
        'Serviço temporariamente indisponível. Tente mais tarde.',
        503,
        undefined,
        cabecalhos
      );
}
