// ============================================================
// Edge Function: api-rent-a-car — API externa de rent-a-car (v1)
// ============================================================
// Fina de propósito: autentica a chave, aplica o limite, encaminha, regista.
// A regra de negócio vive nas funções SQL api_* (org_id da chave, service_role).
// Lógica testável em _shared/api-rent-a-car/*.ts (o CI só corre testes Deno aí).
// Público em https://wegest.pt/api/rent-a-car/v1/* (rewrite do Vercel) e em
// https://<projecto>.supabase.co/functions/v1/api-rent-a-car/v1/*.
// ============================================================
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { autenticar } from '../_shared/api-rent-a-car/auth.ts';
import { servirCatalogo } from '../_shared/api-rent-a-car/catalogo.ts';
import { OPENAPI } from '../_shared/api-rent-a-car/openapi.ts';
import { CORS_HEADERS, erro, ok, respostaLimite } from '../_shared/api-rent-a-car/respostas.ts';
import { resolverRota } from '../_shared/api-rent-a-car/router.ts';
import { consumeRateLimit, trustedRequestIp } from '../_shared/rate-limit/rateLimit.ts';

const CACHE_OPENAPI_SEGUNDOS = 3600;

const env = (k: string) => Deno.env.get(k) ?? '';
const db = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

Deno.serve(async (req) => {
  const inicio = Date.now();
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  const url = new URL(req.url);
  const rota = resolverRota(url, req.method);
  if (!rota) return erro('NAO_ENCONTRADO', 'Rota inexistente. A API vive em /v1.', 404);
  // A especificação é pública: serve a página de documentação sem chave.
  if (rota.recurso === 'openapi.json' && rota.metodo === 'GET') {
    return ok(OPENAPI, { cacheSeconds: CACHE_OPENAPI_SEGUNDOS });
  }

  const cliente = db();
  const ctx = await autenticar(req, cliente);
  if (ctx instanceof Response) return ctx;

  // Limite por chave (rate_limit_per_minute), reservado antes de qualquer leitura.
  const limite = await consumeRateLimit(cliente, {
    operation: 'api-rent-a-car',
    identity: ctx.chaveId,
    limit: Math.min(10000, Math.max(1, ctx.limitePorMinuto)),
    windowSeconds: 60,
  });
  const recusaLimite = respostaLimite(limite);
  if (recusaLimite) return recusaLimite;

  let resposta: Response;
  try {
    if (rota.recurso === 'health') {
      const { data } = await cliente.rpc('api_tarifa_site', { p_org_id: ctx.orgId });
      resposta = ok({
        ok: true,
        organizacao: ctx.orgId,
        permissoes: ctx.permissoes,
        tarifa_site: !!data,
      });
    } else {
      resposta =
        (await servirCatalogo(rota, url, ctx, cliente)) ??
        erro('NAO_ENCONTRADO', `Recurso desconhecido: ${rota.recurso}.`, 404);
    }
  } catch (e) {
    console.error('[api-rent-a-car] erro inesperado:', (e as Error).message, { rota });
    resposta = erro('ERRO_INTERNO', 'Erro inesperado. Tente de novo.', 500);
  }

  // Auditoria best-effort (api_pedidos): sem corpo nem dados de cliente; nunca
  // atrasa nem altera a resposta.
  cliente
    .from('api_pedidos')
    .insert({
      org_id: ctx.orgId,
      api_chave_id: ctx.chaveId,
      metodo: req.method,
      caminho: url.pathname,
      estado_http: resposta.status,
      duracao_ms: Date.now() - inicio,
      ip: trustedRequestIp(req),
    })
    .then(({ error }) => {
      if (error) console.error('[api-rent-a-car] auditoria falhou:', error.message);
    });

  return resposta;
});
