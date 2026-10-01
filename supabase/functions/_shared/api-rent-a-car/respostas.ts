// Respostas da API externa de rent-a-car: um envelope de erro, CORS só para a
// página de documentação, cache opcional para o catálogo.
import type { RateLimitDecision } from '../rate-limit/rateLimit.ts';

export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': 'https://wegest.pt',
  'Access-Control-Allow-Headers': 'x-api-key, authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  Vary: 'Origin',
};

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
  | 'ERRO_INTERNO';

export function ok(body: unknown, init: { status?: number; cacheSeconds?: number } = {}): Response {
  const headers: Record<string, string> = { ...CORS_HEADERS, 'Content-Type': 'application/json' };
  if (init.cacheSeconds) headers['Cache-Control'] = `public, max-age=${init.cacheSeconds}`;
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
    headers: { ...CORS_HEADERS, ...cabecalhos, 'Content-Type': 'application/json' },
  });
}

/**
 * O helper partilhado de rate limit responde `{ success, error }`; esta API fala
 * sempre `{ erro }`. Traduz a decisão e mantém o Retry-After visível ao browser.
 */
export function respostaLimite(decisao: RateLimitDecision): Response | null {
  if (decisao.allowed) return null;
  const cabecalhos = {
    'Retry-After': String(decisao.retryAfter),
    'Access-Control-Expose-Headers': 'Retry-After',
  };
  return decisao.status === 429
    ? erro('LIMITE_EXCEDIDO', 'Limite de pedidos por minuto excedido.', 429, undefined, cabecalhos)
    : erro(
        'ERRO_INTERNO',
        'Serviço temporariamente indisponível. Tente mais tarde.',
        503,
        undefined,
        cabecalhos
      );
}
