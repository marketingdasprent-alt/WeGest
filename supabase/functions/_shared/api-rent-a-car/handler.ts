// Tratamento de um pedido da API externa: router, openapi público, limite anónimo
// por IP, chave, limite por chave, catálogo/health e auditoria. Vive aqui, e não
// na edge function, para ser testável (o CI só corre testes Deno em _shared).
import { consumeRateLimit, trustedRequestIp } from '../rate-limit/rateLimit.ts';
import { autenticar, type ChaveRecusada, type DbRpc } from './auth.ts';
import { servirCatalogo } from './catalogo.ts';
import { OPENAPI } from './openapi.ts';
import { comCors, CORS_HEADERS, erro, ok, respostaLimite } from './respostas.ts';
import { resolverRota } from './router.ts';

const CACHE_OPENAPI_SEGUNDOS = 3600;
const LIMITE_MINIMO = 1;
const LIMITE_MAXIMO = 10000;
// Antes de olhar para a chave: trava quem martela com chaves inventadas.
const LIMITE_ANONIMO_POR_MINUTO = 60;
const CAMINHO_MAXIMO = 200;

/** O que a edge function precisa do cliente Supabase (service_role). */
export interface DbApi extends DbRpc {
  from(tabela: 'api_pedidos'): {
    insert(linha: LinhaAuditoria): PromiseLike<{ error: { message: string } | null }>;
  };
}

/** Uma linha de api_pedidos: sem corpo, sem query string, só caminho e IP de confiança. */
export interface LinhaAuditoria {
  org_id: string | null;
  api_chave_id: string | null;
  metodo: string;
  caminho: string;
  estado_http: number;
  duracao_ms: number;
  ip: string;
}

export interface Resultado {
  resposta: Response;
  /** Escrita best-effort em api_pedidos; null quando o pedido nem chegou a /v1. */
  auditoria: Promise<void> | null;
}

export async function tratarPedido(req: Request, db: DbApi): Promise<Resultado> {
  const r = await tratar(req, db);
  return { ...r, resposta: comCors(req, r.resposta) };
}

async function tratar(req: Request, db: DbApi): Promise<Resultado> {
  const inicio = Date.now();
  if (req.method === 'OPTIONS') {
    return { resposta: new Response(null, { headers: CORS_HEADERS }), auditoria: null };
  }

  const url = new URL(req.url);
  const rota = resolverRota(url, req.method);
  if (!rota) {
    return {
      resposta: erro('NAO_ENCONTRADO', 'Rota inexistente. A API vive em /v1.', 404),
      auditoria: null,
    };
  }
  // A especificação é pública: serve a página de documentação sem chave.
  if (rota.recurso === 'openapi.json' && rota.metodo === 'GET') {
    return {
      resposta: ok(OPENAPI, { cacheSeconds: CACHE_OPENAPI_SEGUNDOS, publico: true }),
      auditoria: null,
    };
  }

  const ip = trustedRequestIp(req);
  // Tudo o que passa daqui fica em api_pedidos, recusas incluídas: 401 e 429
  // anónimo com nulos, 403 e 429 da chave com a chave em causa.
  const registar = (resposta: Response, chave: ChaveRecusada | null): Resultado => ({
    resposta,
    auditoria: registarPedido(db, {
      org_id: chave?.orgId ?? null,
      api_chave_id: chave?.id ?? null,
      metodo: req.method,
      caminho: url.pathname.slice(0, CAMINHO_MAXIMO),
      estado_http: resposta.status,
      duracao_ms: Date.now() - inicio,
      ip,
    }),
  });

  const anonimo = await consumeRateLimit(db, {
    operation: 'api-rent-a-car-anon',
    identity: ip,
    limit: LIMITE_ANONIMO_POR_MINUTO,
    windowSeconds: 60,
  });
  const recusaAnonima = respostaLimite(anonimo);
  if (recusaAnonima) return registar(recusaAnonima, null);

  const auth = await autenticar(req, db);
  if ('recusa' in auth) return registar(auth.recusa, auth.chave ?? null);
  const ctx = auth;
  const chave: ChaveRecusada = { id: ctx.chaveId, orgId: ctx.orgId };

  // Limite por chave (rate_limit_per_minute), reservado antes de qualquer leitura.
  const limite = await consumeRateLimit(db, {
    operation: 'api-rent-a-car',
    identity: ctx.chaveId,
    limit: Math.min(LIMITE_MAXIMO, Math.max(LIMITE_MINIMO, ctx.limitePorMinuto)),
    windowSeconds: 60,
  });
  const recusaLimite = respostaLimite(limite);
  if (recusaLimite) return registar(recusaLimite, chave);

  let resposta: Response;
  try {
    if (rota.recurso === 'health') {
      const { data } = await db.rpc('api_tarifa_site', { p_org_id: ctx.orgId });
      resposta = ok({
        ok: true,
        organizacao: ctx.orgId,
        permissoes: ctx.permissoes,
        tarifa_site: !!data,
      });
    } else {
      // Mensagem fixa: não ecoar o que o cliente pediu.
      resposta =
        (await servirCatalogo(rota, url, ctx, db)) ??
        erro('NAO_ENCONTRADO', 'Recurso inexistente.', 404);
    }
  } catch (e) {
    console.error('[api-rent-a-car] erro inesperado:', (e as Error).message, {
      recurso: rota.recurso,
    });
    resposta = erro('ERRO_INTERNO', 'Erro inesperado. Tente de novo.', 500);
  }
  return registar(resposta, chave);
}

async function registarPedido(db: DbApi, linha: LinhaAuditoria): Promise<void> {
  try {
    const { error } = await db.from('api_pedidos').insert(linha);
    if (error) console.error('[api-rent-a-car] auditoria falhou:', error.message);
  } catch (e) {
    console.error('[api-rent-a-car] auditoria falhou:', (e as Error).message);
  }
}
