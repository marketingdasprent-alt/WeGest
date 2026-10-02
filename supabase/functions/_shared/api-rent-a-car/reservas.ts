// Reservas da API externa (fase C). Valida o formato do pedido, chama as funções
// SQL api_* com o org_id e o id da chave e traduz o código de erro em HTTP. Nunca
// em cache, e nunca registar dados do cliente nos logs.
import { readBoundedJson, RequestBodyError } from '../http/boundedJson.ts';
import type { ContextoApi, DbRpc } from './auth.ts';
import { exigirPermissao } from './auth.ts';
import { type CorpoCotacao, ESTADO_POR_CODIGO, validarCorpoCotacao } from './disponibilidade.ts';
import type { Rota } from './router.ts';
import { type CodigoErro, erro, ok } from './respostas.ts';

const CORPO_MAXIMO = 65536;
const CODIGO = /^\d{1,12}$/;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;
const TELEFONE = /^\+?[0-9 ().-]{6,20}$/;
const NIF = /^\d{9}$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const REFERENCIA = /^[A-Za-z0-9._:-]{1,100}$/;
// O Postgres rebenta (500) com o ano 0; nenhuma data de nascimento ou de carta é anterior.
const DATA_MINIMA = '1900-01-01';

export const ROTAS_RESERVAS = [
  { metodo: 'POST', comCodigo: false, permissao: 'reservas:write' },
  { metodo: 'GET', comCodigo: true, permissao: 'reservas:read' },
  { metodo: 'DELETE', comCodigo: true, permissao: 'reservas:write' },
] as const;

export interface ClienteReserva {
  nome: string;
  email: string;
  telefone: string;
  nif: string | null;
  data_nascimento: string;
  morada: string | null;
  codigo_postal: string | null;
  localidade: string | null;
  pais: string;
}

export interface CartaConducao {
  numero: string;
  validade: string;
  pais: string;
}

export interface CorpoReserva extends CorpoCotacao {
  cliente: ClienteReserva;
  carta_conducao: CartaConducao;
  total_esperado: number;
  referencia_externa: string;
  mensagem: string | null;
}

type Validacao = { ok: true; valor: CorpoReserva } | { ok: false; mensagem: string };

/** AAAA-MM-DD que existe no calendário (31-02 não passa), de 1900-01-01 em diante. */
function lerData(v: unknown): string | null {
  if (typeof v !== 'string' || !DATA.test(v) || v < DATA_MINIMA) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

function obrigatorio(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length >= 1 && t.length <= max ? t : null;
}

/** null quando vazio; undefined quando inválido. */
function opcional(v: unknown, max: number): string | null | undefined {
  if (v == null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  if (t === '') return null;
  return t.length <= max ? t : undefined;
}

const objecto = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export function validarCorpoReserva(corpo: unknown): Validacao {
  const base = validarCorpoCotacao(corpo);
  if (!base.ok) return base;
  const c = corpo as Record<string, unknown>;

  const cl = objecto(c.cliente);
  if (!cl) return { ok: false, mensagem: 'cliente é obrigatório.' };
  const nome = obrigatorio(cl.nome, 200);
  if (!nome) return { ok: false, mensagem: 'cliente.nome é obrigatório (até 200 caracteres).' };
  const email = obrigatorio(cl.email, 254)?.toLowerCase() ?? null;
  if (!email || !EMAIL.test(email)) return { ok: false, mensagem: 'cliente.email inválido.' };
  const telefone = obrigatorio(cl.telefone, 20);
  if (!telefone || !TELEFONE.test(telefone)) {
    return { ok: false, mensagem: 'cliente.telefone inválido.' };
  }
  const nif = opcional(cl.nif, 9);
  if (nif === undefined || (nif !== null && !NIF.test(nif))) {
    return {
      ok: false,
      mensagem:
        'cliente.nif tem de ter 9 dígitos (NIF português); clientes estrangeiros omitem-no.',
    };
  }
  const nascimento = lerData(cl.data_nascimento);
  if (!nascimento || nascimento >= new Date().toISOString().slice(0, 10)) {
    return {
      ok: false,
      mensagem:
        'cliente.data_nascimento tem de ser uma data AAAA-MM-DD no passado, de 1900 em diante.',
    };
  }
  const morada = opcional(cl.morada, 200);
  const codigoPostal = opcional(cl.codigo_postal, 20);
  const localidade = opcional(cl.localidade, 100);
  if (morada === undefined || codigoPostal === undefined || localidade === undefined) {
    return { ok: false, mensagem: 'cliente.morada, codigo_postal ou localidade inválidos.' };
  }
  const pais = obrigatorio(cl.pais, 60);
  if (!pais) return { ok: false, mensagem: 'cliente.pais é obrigatório.' };

  const ca = objecto(c.carta_conducao);
  const numero = ca ? obrigatorio(ca.numero, 40) : null;
  const validade = ca ? lerData(ca.validade) : null;
  const paisCarta = ca ? obrigatorio(ca.pais, 60) : null;
  if (!numero || !validade || !paisCarta) {
    return {
      ok: false,
      mensagem:
        'carta_conducao precisa de numero, validade (AAAA-MM-DD, de 1900 em diante) e pais.',
    };
  }
  // A data do fim no fuso que o site mandou: a carta tem de valer até lá.
  if (validade < base.valor.fim.slice(0, 10)) {
    return { ok: false, mensagem: 'A carta de condução caduca antes do fim do aluguer.' };
  }

  const t = c.total_esperado;
  if (
    typeof t !== 'number' ||
    !Number.isFinite(t) ||
    t < 0 ||
    Math.abs(t * 100 - Math.round(t * 100)) > 1e-6
  ) {
    return {
      ok: false,
      mensagem: 'total_esperado é o subtotal.com_iva da cotação (número com até 2 casas).',
    };
  }
  if (typeof c.referencia_externa !== 'string' || !REFERENCIA.test(c.referencia_externa)) {
    return {
      ok: false,
      mensagem: 'referencia_externa é obrigatória: 1 a 100 caracteres A-Z, a-z, 0-9, . _ : -',
    };
  }
  const mensagem = opcional(c.mensagem, 1000);
  if (mensagem === undefined) {
    return { ok: false, mensagem: 'mensagem tem no máximo 1000 caracteres.' };
  }

  return {
    ok: true,
    valor: {
      ...base.valor,
      cliente: {
        nome,
        email,
        telefone,
        nif,
        data_nascimento: nascimento,
        morada,
        codigo_postal: codigoPostal,
        localidade,
        pais,
      },
      carta_conducao: { numero, validade, pais: paisCarta },
      total_esperado: t,
      referencia_externa: c.referencia_externa,
      mensagem,
    },
  };
}

function responder(data: unknown, error: unknown, status: number): Response {
  if (error) {
    console.error('[api-rent-a-car] reservas falhou:', (error as { message?: string }).message);
    return erro(
      'ERRO_INTERNO',
      'Falha a gravar ou ler a reserva. Pode repetir: a mesma referencia_externa nunca cria duas.',
      500
    );
  }
  const e = (data as { erro?: { codigo: string; mensagem: string; detalhes?: unknown } } | null)
    ?.erro;
  if (e) {
    return erro(e.codigo as CodigoErro, e.mensagem, ESTADO_POR_CODIGO[e.codigo] ?? 400, e.detalhes);
  }
  const { repetida, ...reserva } = (data ?? {}) as { repetida?: boolean } & Record<string, unknown>;
  return ok(reserva, { status: repetida ? 200 : status, semCache: true });
}

/** Devolve a Response das rotas /reservas, ou null quando o recurso não é este. */
export async function servirReservas(
  rota: Rota,
  req: Request,
  ctx: ContextoApi,
  db: DbRpc
): Promise<Response | null> {
  const resposta = await servir(rota, req, ctx, db);
  resposta?.headers.set('Cache-Control', 'no-store');
  return resposta;
}

async function servir(
  rota: Rota,
  req: Request,
  ctx: ContextoApi,
  db: DbRpc
): Promise<Response | null> {
  if (rota.recurso !== 'reservas') return null;
  const def = ROTAS_RESERVAS.find((r) => r.metodo === rota.metodo && r.comCodigo === !!rota.id);
  if (!def) return erro('NAO_ENCONTRADO', 'Recurso inexistente.', 404);
  const recusa = exigirPermissao(ctx, def.permissao);
  if (recusa) return recusa;

  if (rota.id !== null) {
    if (!CODIGO.test(rota.id)) return erro('NAO_ENCONTRADO', 'Reserva não encontrada.', 404);
    const fn = rota.metodo === 'GET' ? 'api_obter_reserva' : 'api_cancelar_reserva';
    const { data, error } = await db.rpc(fn, { p_org_id: ctx.orgId, p_codigo: Number(rota.id) });
    return responder(data, error, 200);
  }

  let corpo: unknown;
  try {
    corpo = await readBoundedJson(req, CORPO_MAXIMO);
  } catch (e) {
    const status = e instanceof RequestBodyError ? e.status : 400;
    return erro('CORPO_INVALIDO', 'Corpo JSON inválido ou acima de 64 KB.', status);
  }
  const v = validarCorpoReserva(corpo);
  if (!v.ok) return erro('PARAMETRO_INVALIDO', v.mensagem, 400);
  const { data, error } = await db.rpc('api_criar_reserva', {
    p_org_id: ctx.orgId,
    p_api_chave_id: ctx.chaveId,
    p_pedido: {
      ...v.valor,
      inicio: new Date(v.valor.inicio).toISOString(),
      fim: new Date(v.valor.fim).toISOString(),
    },
  });
  return responder(data, error, 201);
}
