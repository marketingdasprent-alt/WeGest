// Candidatura TVDE da própria conta: guardar o rascunho e os ficheiros (fotos e PDF) que o
// site envia directamente ao storage por URL assinado. A edge nunca recebe o binário: assina
// o envio e, na confirmação, abre o objecto para ver tamanho e formato reais antes de o
// registar no SQL. Nunca registar o token, o user, caminhos nem dados pessoais.
import { readBoundedJson, RequestBodyError } from '../http/boundedJson.ts';
import { consumeRateLimit } from '../rate-limit/rateLimit.ts';
import type { ContextoApi, DbRpc } from './auth.ts';
import type { ArmazemDocumentos } from './armazemDocumentos.ts';
import { validarRascunho } from './candidaturaRascunho.ts';
import { objecto } from './reservas.ts';
import { erro, ok, respostaLimite } from './respostas.ts';
import { erroDoSql, falhouRpc } from './sql.ts';

export const TIPOS_DOCUMENTO_CANDIDATURA = [
  'documento_frente',
  'documento_verso',
  'carta_frente',
  'carta_verso',
  'licenca_tvde',
  'registo_criminal',
  'comprovativo_morada',
  'comprovativo_iban',
] as const;
export type TipoDocumentoCandidatura = (typeof TIPOS_DOCUMENTO_CANDIDATURA)[number];

export const TAMANHO_MAXIMO_DOCUMENTO = 10 * 1024 * 1024;
export const LIMITE_ENVIOS_POR_DIA = 60;
const CORPO_MAXIMO = 65536;
const CORPO_PEDIDO_MAXIMO = 4096;
const MSG_FALHA = 'Falha a ler ou gravar a candidatura. Tente de novo.';

type Formato = 'pdf' | 'jpg' | 'png';
const EXTENSAO_POR_MIME: Record<string, Formato> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};
const FICHEIRO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$/;

export const eTipoDocumento = (v: string): v is TipoDocumentoCandidatura =>
  (TIPOS_DOCUMENTO_CANDIDATURA as readonly string[]).includes(v);

/** O formato real pelos primeiros bytes; o content_type do cliente não conta. */
export function formatoPelosBytes(b: Uint8Array): Formato | null {
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) {
    return 'pdf';
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return 'png';
  }
  return null;
}

interface Base {
  p_org_id: string;
  p_user_id: string;
}

async function lerCorpo(
  req: Request,
  max: number
): Promise<{ corpo: unknown } | { recusa: Response }> {
  try {
    return { corpo: await readBoundedJson(req, max) };
  } catch (e) {
    const status = e instanceof RequestBodyError ? e.status : 400;
    return { recusa: erro('CORPO_INVALIDO', 'Corpo JSON inválido ou demasiado grande.', status) };
  }
}

/** Resposta da RPC sem os caminhos internos do storage. */
function semCaminhosInternos(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const { caminho_removido: _a, caminho_anterior: _b, ...resto } = data as Record<string, unknown>;
  return resto;
}

function caminhoAnterior(data: unknown): string | null {
  const d = (data ?? {}) as Record<string, unknown>;
  const c = d.caminho_removido ?? d.caminho_anterior;
  return typeof c === 'string' && c ? c : null;
}

/** Apaga o ficheiro substituído ou removido; falhar não derruba a resposta. */
async function limparAnterior(
  anterior: string | null,
  actual: string | null,
  userId: string,
  armazem: ArmazemDocumentos
): Promise<void> {
  if (!anterior || anterior === actual) return;
  // Só objectos da própria candidatura desta conta: a RPC nunca nos faz apagar o de outra.
  if (!anterior.startsWith(`${userId}/candidatura/`) || anterior.includes('..')) return;
  if (!(await armazem.apagar(anterior))) {
    console.error('[api-rent-a-car] documento anterior ficou no storage');
  }
}

export async function guardarRascunho(
  req: Request,
  ctx: ContextoApi,
  db: DbRpc,
  base: Base
): Promise<Response> {
  const lido = await lerCorpo(req, CORPO_MAXIMO);
  if ('recusa' in lido) return lido.recusa;
  const v = validarRascunho(lido.corpo);
  if (!v.ok) return erro('PARAMETRO_INVALIDO', v.mensagem, 400);
  const { data, error } = await db.rpc('api_conta_candidatura_guardar', {
    ...base,
    p_api_chave_id: ctx.chaveId,
    p_pedido: v.valor,
  });
  if (error) return falhouRpc('api_conta_candidatura_guardar', error, MSG_FALHA);
  return erroDoSql(data) ?? ok(data, { semCache: true });
}

function estadoDe(data: unknown): unknown {
  const d = (data ?? {}) as { estado?: unknown; status?: unknown; candidatura?: unknown };
  const c = (d.candidatura ?? {}) as { estado?: unknown; status?: unknown };
  return d.estado ?? d.status ?? c.estado ?? c.status;
}

async function pedirEnvio(
  tipo: TipoDocumentoCandidatura,
  req: Request,
  ctx: ContextoApi,
  db: DbRpc,
  base: Base,
  armazem: ArmazemDocumentos
): Promise<Response> {
  const lido = await lerCorpo(req, CORPO_PEDIDO_MAXIMO);
  if ('recusa' in lido) return lido.recusa;
  const c = objecto(lido.corpo);
  if (!c || Object.keys(c).some((k) => k !== 'content_type' && k !== 'tamanho')) {
    return erro('PARAMETRO_INVALIDO', 'O corpo só aceita content_type e tamanho.', 400);
  }
  const mime = typeof c.content_type === 'string' ? c.content_type : '';
  if (!Object.hasOwn(EXTENSAO_POR_MIME, mime)) {
    return erro(
      'PARAMETRO_INVALIDO',
      'content_type tem de ser application/pdf, image/jpeg ou image/png.',
      400
    );
  }
  const tamanho = c.tamanho;
  if (
    typeof tamanho !== 'number' ||
    !Number.isInteger(tamanho) ||
    tamanho < 1 ||
    tamanho > TAMANHO_MAXIMO_DOCUMENTO
  ) {
    return erro(
      'PARAMETRO_INVALIDO',
      `tamanho é um inteiro de bytes entre 1 e ${TAMANHO_MAXIMO_DOCUMENTO}.`,
      400
    );
  }

  const limite = await consumeRateLimit(db, {
    operation: 'api-rent-a-car-conta-doc-envio',
    identity: `${ctx.chaveId}:${base.p_user_id}`,
    limit: LIMITE_ENVIOS_POR_DIA,
    windowSeconds: 86400,
  });
  const recusaLimite = respostaLimite(
    limite,
    `Limite de ${LIMITE_ENVIOS_POR_DIA} envios por dia excedido.`
  );
  if (recusaLimite) return recusaLimite;

  // Só se assina o envio para um rascunho: depois de submetida a candidatura não muda.
  const { data, error } = await db.rpc('api_conta_candidatura', { ...base });
  if (error) return falhouRpc('api_conta_candidatura', error, MSG_FALHA);
  const recusa = erroDoSql(data);
  if (recusa) return recusa;
  if (!data) {
    return erro('NAO_ENCONTRADO', 'Ainda não há candidatura: guarde o rascunho primeiro.', 404);
  }
  if (estadoDe(data) !== 'rascunho') {
    return erro(
      'CANDIDATURA_NAO_EDITAVEL',
      'A candidatura já foi submetida e não aceita ficheiros.',
      409
    );
  }

  const caminho = `${base.p_user_id}/candidatura/${tipo}/${crypto.randomUUID()}.${EXTENSAO_POR_MIME[mime]}`;
  const envio = await armazem.assinarEnvio(caminho);
  if ('erro' in envio) {
    console.error('[api-rent-a-car] assinar envio falhou:', { motivo: envio.erro });
    return erro('ERRO_INTERNO', 'Envio de ficheiros indisponível de momento.', 503);
  }
  return ok(
    {
      upload_url: envio.url,
      caminho,
      expira_em: envio.expiraEm,
      metodo: 'PUT',
      cabecalhos: { 'Content-Type': mime },
    },
    { semCache: true }
  );
}

const recusaFicheiro = (mensagem: string) => erro('PEDIDO_INVALIDO', mensagem, 422);

async function confirmarDocumento(
  tipo: TipoDocumentoCandidatura,
  req: Request,
  db: DbRpc,
  base: Base,
  armazem: ArmazemDocumentos
): Promise<Response> {
  const lido = await lerCorpo(req, CORPO_PEDIDO_MAXIMO);
  if ('recusa' in lido) return lido.recusa;
  const c = objecto(lido.corpo);
  if (!c || Object.keys(c).some((k) => k !== 'caminho') || typeof c.caminho !== 'string') {
    return erro(
      'PARAMETRO_INVALIDO',
      'O corpo é { "caminho": "..." }, o caminho devolvido no pedido de envio.',
      400
    );
  }
  const caminho = c.caminho;
  const prefixo = `${base.p_user_id}/candidatura/${tipo}/`;
  const resto = caminho.slice(prefixo.length);
  // Caminho de outra conta ou de outro tipo: recusa sem tocar no storage (não é nosso apagar).
  if (!caminho.startsWith(prefixo) || !FICHEIRO.test(resto)) {
    return erro('PARAMETRO_INVALIDO', 'caminho inválido para este documento.', 400);
  }
  const naoEncontrado = () =>
    erro('NAO_ENCONTRADO', 'Ficheiro não encontrado: envie-o primeiro para o upload_url.', 404);
  const indisponivel = () =>
    erro('ERRO_INTERNO', 'Verificação de ficheiros indisponível de momento.', 503);

  const info = await armazem.info(caminho);
  if ('naoExiste' in info) return naoEncontrado();
  if ('erro' in info) return indisponivel();
  if (info.tamanho < 1 || info.tamanho > TAMANHO_MAXIMO_DOCUMENTO) {
    await armazem.apagar(caminho);
    return recusaFicheiro('O ficheiro tem de ter entre 1 byte e 10 MB.');
  }

  const inicio = await armazem.inicio(caminho, 8);
  if ('naoExiste' in inicio) return naoEncontrado();
  if ('erro' in inicio) return indisponivel();
  const formato = formatoPelosBytes(inicio.bytes);
  const extensao = resto.slice(resto.lastIndexOf('.') + 1);
  if (!formato || formato !== extensao) {
    await armazem.apagar(caminho);
    return recusaFicheiro('O ficheiro tem de ser um PDF, JPEG ou PNG válido.');
  }

  // Um erro da RPC não apaga o objecto: pode ser o ficheiro já registado (confirmação repetida).
  const { data, error } = await db.rpc('api_conta_candidatura_documento', {
    ...base,
    p_tipo: tipo,
    p_caminho: caminho,
  });
  if (error) return falhouRpc('api_conta_candidatura_documento', error, MSG_FALHA);
  const recusa = erroDoSql(data);
  if (recusa) return recusa;
  await limparAnterior(caminhoAnterior(data), caminho, base.p_user_id, armazem);
  return ok(semCaminhosInternos(data), { semCache: true });
}

async function removerDocumento(
  tipo: TipoDocumentoCandidatura,
  db: DbRpc,
  base: Base,
  armazem: ArmazemDocumentos
): Promise<Response> {
  const { data, error } = await db.rpc('api_conta_candidatura_documento', {
    ...base,
    p_tipo: tipo,
    p_caminho: null,
  });
  if (error) return falhouRpc('api_conta_candidatura_documento', error, MSG_FALHA);
  const recusa = erroDoSql(data);
  if (recusa) return recusa;
  await limparAnterior(caminhoAnterior(data), null, base.p_user_id, armazem);
  return ok(semCaminhosInternos(data), { semCache: true });
}

/** Rotas /conta/candidatura-documentos/{tipo}; sem armazém configurado, 503. */
export async function servirDocumento(
  metodo: 'POST' | 'PUT' | 'DELETE',
  tipo: TipoDocumentoCandidatura,
  req: Request,
  ctx: ContextoApi,
  db: DbRpc,
  base: Base,
  armazem: ArmazemDocumentos | null
): Promise<Response> {
  if (!armazem) return erro('ERRO_INTERNO', 'Envio de ficheiros indisponível de momento.', 503);
  if (metodo === 'POST') return await pedirEnvio(tipo, req, ctx, db, base, armazem);
  if (metodo === 'PUT') return await confirmarDocumento(tipo, req, db, base, armazem);
  return await removerDocumento(tipo, db, base, armazem);
}
