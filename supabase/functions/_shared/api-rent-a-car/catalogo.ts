// Catálogo da API externa (localizações, categorias, modelos, extras, coberturas).
// Sem regra de negócio: valida o pedido, chama a função SQL api_* com o org_id
// da chave e devolve o JSON tal como vem, com cache PRIVADA curta (a resposta
// depende da organização da chave; uma cache partilhada não a pode guardar).
import type { ContextoApi } from './auth.ts';
import { exigirPermissao } from './auth.ts';
import { type DbComFotos, preencherFotos } from './fotos.ts';
import type { Rota } from './router.ts';
import { erro, ok } from './respostas.ts';

const CACHE_CATALOGO_SEGUNDOS = 300;
const TIPOS = new Set(['passageiros', 'comercial']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ROTAS_CATALOGO = [
  { recurso: 'localizacoes', comId: false, permissao: 'catalogo:read', rpc: 'api_localizacoes' },
  { recurso: 'categorias', comId: false, permissao: 'catalogo:read', rpc: 'api_categorias' },
  { recurso: 'modelos', comId: true, permissao: 'catalogo:read', rpc: 'api_modelos' },
  { recurso: 'extras', comId: false, permissao: 'catalogo:read', rpc: 'api_extras' },
  { recurso: 'coberturas', comId: false, permissao: 'catalogo:read', rpc: 'api_coberturas' },
] as const;

/** Devolve a Response do catálogo, ou null quando a rota não é de catálogo. */
export async function servirCatalogo(
  rota: Rota,
  url: URL,
  ctx: ContextoApi,
  db: DbComFotos
): Promise<Response | null> {
  const def = ROTAS_CATALOGO.find((r) => r.recurso === rota.recurso);
  if (!def || rota.metodo !== 'GET') return null;
  const recusa = exigirPermissao(ctx, def.permissao);
  if (recusa) return recusa;

  if (rota.id) {
    if (!def.comId) return erro('NAO_ENCONTRADO', 'Recurso sem detalhe por id.', 404);
    // Um id que não é UUID nunca existe: 404 sem ir à base (o cast ::uuid rebentava em 500).
    if (!UUID.test(rota.id)) return erro('NAO_ENCONTRADO', 'Modelo não encontrado.', 404);
    const { data, error } = await db.rpc('api_modelo', {
      p_org_id: ctx.orgId,
      p_modelo_id: rota.id,
    });
    if (error) return erro('ERRO_INTERNO', 'Falha a ler o catálogo.', 500);
    if (!data) return erro('NAO_ENCONTRADO', 'Modelo não encontrado.', 404);
    await preencherFotos(data, db);
    return ok(data, { cacheSeconds: CACHE_CATALOGO_SEGUNDOS });
  }

  const args: Record<string, unknown> = { p_org_id: ctx.orgId };
  if (def.recurso === 'modelos') {
    const tipo = url.searchParams.get('tipo');
    if (tipo && !TIPOS.has(tipo)) {
      return erro('PARAMETRO_INVALIDO', 'tipo tem de ser passageiros ou comercial.', 400);
    }
    const categoria = url.searchParams.get('categoria');
    if (categoria && !UUID.test(categoria)) {
      return erro('PARAMETRO_INVALIDO', 'categoria tem de ser um UUID.', 400);
    }
    args.p_categoria = categoria;
    args.p_tipo = tipo;
  }
  const { data, error } = await db.rpc(def.rpc, args);
  if (error) return erro('ERRO_INTERNO', 'Falha a ler o catálogo.', 500);
  if (def.recurso === 'modelos') await preencherFotos(data, db);
  return ok(data ?? [], { cacheSeconds: CACHE_CATALOGO_SEGUNDOS });
}
