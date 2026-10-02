// Disponibilidade e cotação da API externa (fase B). Valida o formato do pedido,
// chama a função SQL api_* com o org_id da chave e traduz o código de erro de
// negócio em HTTP. Sem cache: a disponibilidade muda de minuto a minuto.
import { readBoundedJson, RequestBodyError } from '../http/boundedJson.ts';
import type { ContextoApi, DbRpc } from './auth.ts';
import { exigirPermissao } from './auth.ts';
import type { Rota } from './router.ts';
import { type CodigoErro, erro, ok } from './respostas.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;
const TIPOS = new Set(['passageiros', 'comercial']);
const CORPO_MAXIMO = 65536;
const EXTRAS_MAXIMO = 20;

export const ROTAS_DISPONIBILIDADE = [
  { recurso: 'disponibilidade', metodo: 'GET', permissao: 'disponibilidade:read' },
  { recurso: 'cotacoes', metodo: 'POST', permissao: 'disponibilidade:read' },
] as const;

/** Código de erro de negócio devolvido pelas funções SQL → estado HTTP. */
export const ESTADO_POR_CODIGO: Record<string, number> = {
  PERIODO_INVALIDO: 400,
  PERIODO_EXCEDE_MAXIMO: 400,
  PARAMETRO_INVALIDO: 400,
  NAO_ENCONTRADO: 404,
  TARIFA_INDISPONIVEL: 409,
  SEM_DISPONIBILIDADE: 409,
  CONFIG_EM_FALTA: 503,
};

export interface CorpoCotacao {
  modelo_id: string;
  inicio: string;
  fim: string;
  entrega: string;
  recolha: string;
  extras: { extra_id: string; quantidade: number }[];
  cobertura_id: string | null;
}

/** Só ISO 8601 com fuso explícito: uma data sem fuso é ambígua. */
export function lerDataComFuso(valor: string | null): Date | null {
  if (!valor || !ISO_COM_FUSO.test(valor)) return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function validarCorpoCotacao(
  corpo: unknown
): { ok: true; valor: CorpoCotacao } | { ok: false; mensagem: string } {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    return { ok: false, mensagem: 'Corpo tem de ser um objecto JSON.' };
  }
  const c = corpo as Record<string, unknown>;
  for (const campo of ['modelo_id', 'entrega', 'recolha'] as const) {
    const v = c[campo];
    if (typeof v !== 'string' || !UUID.test(v)) {
      return { ok: false, mensagem: `${campo} tem de ser um UUID.` };
    }
  }
  if (
    c.cobertura_id != null &&
    (typeof c.cobertura_id !== 'string' || !UUID.test(c.cobertura_id))
  ) {
    return { ok: false, mensagem: 'cobertura_id tem de ser um UUID.' };
  }
  for (const campo of ['inicio', 'fim'] as const) {
    const v = c[campo];
    if (typeof v !== 'string' || !lerDataComFuso(v)) {
      return {
        ok: false,
        mensagem: `${campo} tem de ser uma data ISO 8601 com fuso (ex.: 2026-10-10T10:00:00+01:00).`,
      };
    }
  }
  const extras = c.extras ?? [];
  if (!Array.isArray(extras) || extras.length > EXTRAS_MAXIMO) {
    return { ok: false, mensagem: `extras tem de ser uma lista com até ${EXTRAS_MAXIMO} itens.` };
  }
  for (const e of extras) {
    const x = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
    if (
      typeof x.extra_id !== 'string' ||
      !UUID.test(x.extra_id) ||
      typeof x.quantidade !== 'number' ||
      !Number.isInteger(x.quantidade) ||
      x.quantidade < 1
    ) {
      return {
        ok: false,
        mensagem: 'Cada extra precisa de extra_id (UUID) e de uma quantidade inteira positiva.',
      };
    }
  }
  return {
    ok: true,
    valor: {
      modelo_id: c.modelo_id as string,
      inicio: c.inicio as string,
      fim: c.fim as string,
      entrega: c.entrega as string,
      recolha: c.recolha as string,
      // Só os dois campos conhecidos seguem para a base.
      extras: (extras as { extra_id: string; quantidade: number }[]).map((x) => ({
        extra_id: x.extra_id,
        quantidade: x.quantidade,
      })),
      cobertura_id: (c.cobertura_id as string | null | undefined) ?? null,
    },
  };
}

function responder(data: unknown, error: unknown): Response {
  if (error) {
    console.error(
      '[api-rent-a-car] disponibilidade falhou:',
      (error as { message?: string }).message
    );
    return erro('ERRO_INTERNO', 'Falha a calcular a disponibilidade.', 500);
  }
  const e = (data as { erro?: { codigo: string; mensagem: string } } | null)?.erro;
  if (e) return erro(e.codigo as CodigoErro, e.mensagem, ESTADO_POR_CODIGO[e.codigo] ?? 400);
  return ok(data, { semCache: true });
}

/** Devolve a Response de disponibilidade/cotação, ou null quando a rota não é destas. */
export async function servirDisponibilidade(
  rota: Rota,
  url: URL,
  req: Request,
  ctx: ContextoApi,
  db: DbRpc
): Promise<Response | null> {
  const def = ROTAS_DISPONIBILIDADE.find((r) => r.recurso === rota.recurso);
  if (!def) return null;
  if (rota.metodo !== def.metodo || rota.id)
    return erro('NAO_ENCONTRADO', 'Recurso inexistente.', 404);
  const recusa = exigirPermissao(ctx, def.permissao);
  if (recusa) return recusa;

  if (def.recurso === 'disponibilidade') {
    const q = url.searchParams;
    const inicio = lerDataComFuso(q.get('inicio'));
    const fim = lerDataComFuso(q.get('fim'));
    if (!inicio || !fim) {
      return erro('PARAMETRO_INVALIDO', 'inicio e fim são datas ISO 8601 com fuso.', 400);
    }
    for (const p of ['entrega', 'recolha']) {
      if (!UUID.test(q.get(p) ?? '')) {
        return erro('PARAMETRO_INVALIDO', `${p} tem de ser um UUID.`, 400);
      }
    }
    const categoria = q.get('categoria');
    if (categoria && !UUID.test(categoria)) {
      return erro('PARAMETRO_INVALIDO', 'categoria tem de ser um UUID.', 400);
    }
    const tipo = q.get('tipo');
    if (tipo && !TIPOS.has(tipo)) {
      return erro('PARAMETRO_INVALIDO', 'tipo tem de ser passageiros ou comercial.', 400);
    }
    const { data, error } = await db.rpc('api_disponibilidade', {
      p_org_id: ctx.orgId,
      p_inicio: inicio.toISOString(),
      p_fim: fim.toISOString(),
      p_entrega: q.get('entrega'),
      p_recolha: q.get('recolha'),
      p_categoria: categoria || null,
      p_tipo: tipo || null,
    });
    return responder(data, error);
  }

  let corpo: unknown;
  try {
    corpo = await readBoundedJson(req, CORPO_MAXIMO);
  } catch (e) {
    const status = e instanceof RequestBodyError ? e.status : 400;
    return erro('CORPO_INVALIDO', 'Corpo JSON inválido ou acima de 64 KB.', status);
  }
  const v = validarCorpoCotacao(corpo);
  if (!v.ok) return erro('PARAMETRO_INVALIDO', v.mensagem, 400);
  const { data, error } = await db.rpc('api_cotacao', {
    p_org_id: ctx.orgId,
    p_modelo_id: v.valor.modelo_id,
    p_inicio: new Date(v.valor.inicio).toISOString(),
    p_fim: new Date(v.valor.fim).toISOString(),
    p_entrega: v.valor.entrega,
    p_recolha: v.valor.recolha,
    p_extras: v.valor.extras,
    p_cobertura_id: v.valor.cobertura_id,
  });
  return responder(data, error);
}
