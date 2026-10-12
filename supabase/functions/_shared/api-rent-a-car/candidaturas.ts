// Candidaturas TVDE da API externa (fase D2). Valida o formato do pedido, aplica o
// limite diário por chave, chama a função SQL api_tvde_* com o org_id e o id da chave
// e traduz o código de erro em HTTP. Os checksums de NIF e IBAN ficam para o SQL.
// Nunca em cache, e nunca registar dados pessoais nos logs.
import { readBoundedJson, RequestBodyError } from '../http/boundedJson.ts';
import { consumeRateLimit } from '../rate-limit/rateLimit.ts';
import type { ContextoApi, DbRpc } from './auth.ts';
import { exigirPermissao } from './auth.ts';
import { ESTADO_POR_CODIGO, lerDataComFuso } from './disponibilidade.ts';
import {
  EMAIL,
  lerData,
  objecto,
  obrigatorio,
  opcional,
  REFERENCIA,
  TELEFONE,
} from './reservas.ts';
import type { Rota } from './router.ts';
import { type CodigoErro, erro, ok, respostaLimite } from './respostas.ts';

export const LIMITE_CANDIDATURAS_POR_DIA = 50;

const CORPO_MAXIMO = 65536;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIF = /^\d{9}$/;
const CODIGO_POSTAL = /^\d{4}-\d{3}$/;
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
const TIPOS_DOCUMENTO = ['cc', 'bi', 'ar', 'tr', 'passaporte'] as const;
// Espelha src/utils/candidatura.ts (CATEGORIAS_CARTA).
const CATEGORIAS_CARTA = new Set([
  'A',
  'A1',
  'A2',
  'AM',
  'B',
  'B1',
  'BE',
  'C',
  'C1',
  'CE',
  'D',
  'D1',
  'DE',
]);
const CATEGORIAS_MAXIMO = 16;
const INICIO_MAXIMO_DIAS = 180;
const CONSENTIMENTO_FUTURO_MS = 5 * 60 * 1000;

export const ROTAS_CANDIDATURAS = [
  { metodo: 'POST', comId: false, permissao: 'tvde:candidaturas:write' },
  { metodo: 'GET', comId: true, permissao: 'tvde:candidaturas:read' },
] as const;

type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export interface CorpoCandidatura {
  referencia_externa: string;
  nome: string;
  email: string;
  telefone: string;
  nif: string;
  morada: string;
  codigo_postal: string;
  cidade: string;
  documento: { tipo: TipoDocumento; numero: string; validade: string };
  carta_conducao: { numero: string; categorias: string[]; validade: string };
  licenca_tvde: { numero: string; validade: string } | null;
  em_formacao_tvde: boolean;
  iban: string;
  modelo_pretendido_id: string | null;
  data_inicio_pretendida: string | null;
  observacoes: string | null;
  consentimento: { versao: string; aceite_em: string };
}

type Validacao = { ok: true; valor: CorpoCandidatura } | { ok: false; mensagem: string };

const recusa = (mensagem: string): Validacao => ({ ok: false, mensagem });

/** AAAA-MM-DD depois de hoje (uma validade que acaba hoje já não serve). */
function validadeFutura(v: unknown, hoje: string): string | null {
  const d = lerData(v);
  return d && d > hoje ? d : null;
}

function somarDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function validarCorpoCandidatura(corpo: unknown, hoje = new Date()): Validacao {
  const c = objecto(corpo);
  if (!c) return recusa('Corpo tem de ser um objecto JSON.');
  const dia = hoje.toISOString().slice(0, 10);

  if (typeof c.referencia_externa !== 'string' || !REFERENCIA.test(c.referencia_externa)) {
    return recusa('referencia_externa é obrigatória: 1 a 100 caracteres A-Z, a-z, 0-9, . _ : -');
  }
  const nome = obrigatorio(c.nome, 200);
  if (!nome) return recusa('nome é obrigatório (até 200 caracteres).');
  const email = obrigatorio(c.email, 254)?.toLowerCase() ?? null;
  if (!email || !EMAIL.test(email)) return recusa('email inválido.');
  const telefone = obrigatorio(c.telefone, 20);
  if (!telefone || !TELEFONE.test(telefone)) return recusa('telefone inválido.');
  const nif = typeof c.nif === 'string' ? c.nif.replace(/\s/g, '') : '';
  if (!NIF.test(nif)) return recusa('nif tem de ter 9 dígitos (NIF português).');
  const morada = obrigatorio(c.morada, 200);
  if (!morada) return recusa('morada é obrigatória (até 200 caracteres).');
  const codigoPostal = obrigatorio(c.codigo_postal, 8);
  if (!codigoPostal || !CODIGO_POSTAL.test(codigoPostal)) {
    return recusa('codigo_postal tem de ter o formato 0000-000.');
  }
  const cidade = obrigatorio(c.cidade, 100);
  if (!cidade) return recusa('cidade é obrigatória (até 100 caracteres).');

  const doc = objecto(c.documento);
  const tipo = TIPOS_DOCUMENTO.find((t) => t === doc?.tipo);
  if (!doc || !tipo) {
    return recusa(`documento.tipo tem de ser um de: ${TIPOS_DOCUMENTO.join(', ')}.`);
  }
  const docNumero = obrigatorio(doc.numero, 40);
  const docValidade = validadeFutura(doc.validade, dia);
  if (!docNumero || !docValidade) {
    return recusa('documento precisa de numero e de uma validade AAAA-MM-DD depois de hoje.');
  }

  const carta = objecto(c.carta_conducao);
  const cartaNumero = carta ? obrigatorio(carta.numero, 40) : null;
  const cartaValidade = carta ? validadeFutura(carta.validade, dia) : null;
  if (!carta || !cartaNumero || !cartaValidade) {
    return recusa(
      'carta_conducao precisa de numero, categorias e uma validade AAAA-MM-DD depois de hoje.'
    );
  }
  const categorias = carta.categorias;
  if (
    !Array.isArray(categorias) ||
    categorias.length === 0 ||
    categorias.length > CATEGORIAS_MAXIMO ||
    !categorias.every((k) => typeof k === 'string' && CATEGORIAS_CARTA.has(k))
  ) {
    return recusa(
      `carta_conducao.categorias é uma lista (até ${CATEGORIAS_MAXIMO}) de: ${[...CATEGORIAS_CARTA].join(', ')}.`
    );
  }
  if (!categorias.includes('B')) return recusa('carta_conducao.categorias tem de incluir B.');

  const emFormacao = c.em_formacao_tvde ?? false;
  if (typeof emFormacao !== 'boolean') return recusa('em_formacao_tvde é true ou false.');
  let licenca: CorpoCandidatura['licenca_tvde'] = null;
  if (c.licenca_tvde != null) {
    const l = objecto(c.licenca_tvde);
    const numero = l ? obrigatorio(l.numero, 40) : null;
    const validade = l ? validadeFutura(l.validade, dia) : null;
    if (!numero || !validade) {
      return recusa('licenca_tvde precisa de numero e de uma validade AAAA-MM-DD depois de hoje.');
    }
    licenca = { numero, validade };
  } else if (!emFormacao) {
    return recusa('licenca_tvde é obrigatória, salvo com em_formacao_tvde: true.');
  }

  const iban = typeof c.iban === 'string' ? c.iban.replace(/\s/g, '').toUpperCase() : '';
  if (!IBAN.test(iban)) return recusa('iban inválido.');

  const modelo = c.modelo_pretendido_id ?? null;
  if (modelo !== null && (typeof modelo !== 'string' || !UUID.test(modelo))) {
    return recusa('modelo_pretendido_id tem de ser um UUID.');
  }
  let inicio: string | null = null;
  if (c.data_inicio_pretendida != null) {
    inicio = lerData(c.data_inicio_pretendida);
    if (!inicio || inicio < dia || inicio > somarDias(dia, INICIO_MAXIMO_DIAS)) {
      return recusa(
        `data_inicio_pretendida é uma data AAAA-MM-DD entre hoje e daqui a ${INICIO_MAXIMO_DIAS} dias.`
      );
    }
  }
  const observacoes = opcional(c.observacoes, 1000);
  if (observacoes === undefined) return recusa('observacoes tem no máximo 1000 caracteres.');

  const consentimento = objecto(c.consentimento);
  const versao = consentimento ? obrigatorio(consentimento.versao, 50) : null;
  const aceite =
    consentimento && typeof consentimento.aceite_em === 'string'
      ? lerDataComFuso(consentimento.aceite_em)
      : null;
  if (!versao || !aceite || aceite.getTime() > hoje.getTime() + CONSENTIMENTO_FUTURO_MS) {
    return recusa(
      'consentimento precisa de versao e de aceite_em (ISO 8601 com fuso, não no futuro).'
    );
  }

  return {
    ok: true,
    valor: {
      referencia_externa: c.referencia_externa,
      nome,
      email,
      telefone,
      nif,
      morada,
      codigo_postal: codigoPostal,
      cidade,
      documento: { tipo, numero: docNumero, validade: docValidade },
      carta_conducao: { numero: cartaNumero, categorias, validade: cartaValidade },
      licenca_tvde: licenca,
      em_formacao_tvde: emFormacao,
      iban,
      modelo_pretendido_id: modelo,
      data_inicio_pretendida: inicio,
      observacoes,
      consentimento: { versao, aceite_em: aceite.toISOString() },
    },
  };
}

function responder(rpc: string, data: unknown, error: unknown, status: number): Response {
  if (error) {
    // Só o código (SQLSTATE) e a RPC: a mensagem do Postgres pode citar NIF, email ou nome.
    const codigo = (error as { code?: unknown }).code;
    console.error('[api-rent-a-car] candidaturas falhou:', {
      rpc,
      codigo: typeof codigo === 'string' ? codigo : null,
    });
    return erro(
      'ERRO_INTERNO',
      'Falha a gravar ou ler a candidatura. Pode repetir: a mesma referencia_externa nunca cria duas.',
      500
    );
  }
  const e = (data as { erro?: { codigo: string; mensagem: string; detalhes?: unknown } } | null)
    ?.erro;
  if (e) {
    return erro(e.codigo as CodigoErro, e.mensagem, ESTADO_POR_CODIGO[e.codigo] ?? 400, e.detalhes);
  }
  const { repetida, ...candidatura } = (data ?? {}) as { repetida?: boolean } & Record<
    string,
    unknown
  >;
  return ok(candidatura, { status: repetida ? 200 : status, semCache: true });
}

/** Devolve a Response das rotas /tvde/candidaturas, ou null quando o recurso não é este. */
export async function servirCandidaturas(
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
  if (rota.recurso !== 'tvde/candidaturas') return null;
  const def = ROTAS_CANDIDATURAS.find((r) => r.metodo === rota.metodo && r.comId === !!rota.id);
  if (!def) return erro('NAO_ENCONTRADO', 'Recurso inexistente.', 404);
  const recusaPermissao = exigirPermissao(ctx, def.permissao);
  if (recusaPermissao) return recusaPermissao;

  if (rota.id !== null) {
    // Um id que não é UUID nunca existe: 404 sem ir à base (o cast ::uuid rebentava em 500).
    if (!UUID.test(rota.id)) return erro('NAO_ENCONTRADO', 'Candidatura não encontrada.', 404);
    const { data, error } = await db.rpc('api_tvde_obter_candidatura', {
      p_org_id: ctx.orgId,
      p_id: rota.id,
    });
    return responder('api_tvde_obter_candidatura', data, error, 200);
  }

  let corpo: unknown;
  try {
    corpo = await readBoundedJson(req, CORPO_MAXIMO);
  } catch (e) {
    const status = e instanceof RequestBodyError ? e.status : 400;
    return erro('CORPO_INVALIDO', 'Corpo JSON inválido ou acima de 64 KB.', status);
  }
  const v = validarCorpoCandidatura(corpo);
  if (!v.ok) return erro('PARAMETRO_INVALIDO', v.mensagem, 400);

  // Depois da validação (um corpo mal formado não gasta a quota) e antes de gravar.
  const limite = await consumeRateLimit(db, {
    operation: 'api-rent-a-car-candidaturas',
    identity: ctx.chaveId,
    limit: LIMITE_CANDIDATURAS_POR_DIA,
    windowSeconds: 86400,
  });
  const recusaLimite = respostaLimite(
    limite,
    `Limite de ${LIMITE_CANDIDATURAS_POR_DIA} candidaturas por dia excedido.`
  );
  if (recusaLimite) return recusaLimite;

  const { data, error } = await db.rpc('api_tvde_criar_candidatura', {
    p_org_id: ctx.orgId,
    p_api_chave_id: ctx.chaveId,
    p_pedido: v.valor,
  });
  return responder('api_tvde_criar_candidatura', data, error, 201);
}
