// Rotas TVDE da API externa (fase D1): catálogo de aluguer semanal e disponibilidade
// aberta (o contrato TVDE não tem fim). Valida o formato, chama a função SQL api_tvde_*
// com o org_id da chave e traduz o código de erro em HTTP, como o catálogo e a fase B.
import type { ContextoApi, DbRpc } from './auth.ts';
import { exigirPermissao } from './auth.ts';
import { ESTADO_POR_CODIGO, lerDataComFuso } from './disponibilidade.ts';
import type { Rota } from './router.ts';
import { type CodigoErro, erro, ok } from './respostas.ts';

const CACHE_CATALOGO_SEGUNDOS = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ROTAS_TVDE = [
  { recurso: 'tvde/modelos', comId: true, permissao: 'tvde:catalogo:read' },
  { recurso: 'tvde/disponibilidade', comId: false, permissao: 'tvde:catalogo:read' },
] as const;

/** Só o SQLSTATE e a RPC vão para o log: a mensagem do Postgres pode citar dados. */
function falhou(rpc: string, error: unknown, mensagem: string): Response {
  const codigo = (error as { code?: unknown }).code;
  console.error('[api-rent-a-car] tvde falhou:', {
    rpc,
    codigo: typeof codigo === 'string' ? codigo : null,
  });
  return erro('ERRO_INTERNO', mensagem, 500);
}

/** Devolve a Response das rotas /tvde/*, ou null quando o recurso não é TVDE. */
export async function servirTvde(
  rota: Rota,
  url: URL,
  ctx: ContextoApi,
  db: DbRpc
): Promise<Response | null> {
  const def = ROTAS_TVDE.find((r) => r.recurso === rota.recurso);
  if (!def) return null;
  if (rota.metodo !== 'GET' || (rota.id && !def.comId)) {
    return erro('NAO_ENCONTRADO', 'Recurso inexistente.', 404);
  }
  const recusa = exigirPermissao(ctx, def.permissao);
  if (recusa) return recusa;

  if (def.recurso === 'tvde/disponibilidade') {
    const resposta = await disponibilidade(url, ctx, db);
    // Erros incluídos: um 503 de agora não pode ser servido depois de a tarifa ser marcada.
    resposta.headers.set('Cache-Control', 'no-store');
    return resposta;
  }

  if (rota.id) {
    // Um id que não é UUID nunca existe: 404 sem ir à base (o cast ::uuid rebentava em 500).
    if (!UUID.test(rota.id)) return erro('NAO_ENCONTRADO', 'Modelo não encontrado.', 404);
    const { data, error } = await db.rpc('api_tvde_modelo', {
      p_org_id: ctx.orgId,
      p_modelo_id: rota.id,
    });
    if (error) return falhou('api_tvde_modelo', error, 'Falha a ler o catálogo TVDE.');
    if (!data) return erro('NAO_ENCONTRADO', 'Modelo não encontrado.', 404);
    return ok(data, { cacheSeconds: CACHE_CATALOGO_SEGUNDOS });
  }

  const { data, error } = await db.rpc('api_tvde_modelos', { p_org_id: ctx.orgId });
  if (error) return falhou('api_tvde_modelos', error, 'Falha a ler o catálogo TVDE.');
  return ok(data ?? [], { cacheSeconds: CACHE_CATALOGO_SEGUNDOS });
}

async function disponibilidade(url: URL, ctx: ContextoApi, db: DbRpc): Promise<Response> {
  const inicio = lerDataComFuso(url.searchParams.get('inicio'));
  if (!inicio) {
    return erro(
      'PARAMETRO_INVALIDO',
      'inicio tem de ser uma data ISO 8601 com fuso (ex.: 2026-10-12T09:00:00+01:00).',
      400
    );
  }
  const { data, error } = await db.rpc('api_tvde_disponibilidade', {
    p_org_id: ctx.orgId,
    p_inicio: inicio.toISOString(),
  });
  if (error) {
    return falhou('api_tvde_disponibilidade', error, 'Falha a calcular a disponibilidade.');
  }
  const e = (data as { erro?: { codigo: string; mensagem: string } } | null)?.erro;
  if (e) return erro(e.codigo as CodigoErro, e.mensagem, ESTADO_POR_CODIGO[e.codigo] ?? 400);
  return ok(data, { semCache: true });
}
