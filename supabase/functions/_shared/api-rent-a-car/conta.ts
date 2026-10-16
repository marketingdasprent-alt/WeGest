// Conta de cliente da API externa: a pessoa entra no site com a conta WeGest e vê as
// suas reservas de rent-a-car e faturas. Cada pedido traz a chave (organização) e o
// access_token da pessoa (X-Conta-Token ou X-Motorista-Token); as funções SQL api_conta_*
// só devolvem o que é da ficha de cliente ligada a essa conta nessa organização.
// Nunca em cache, e nunca registar o token, o email ou o PDF nos logs.
import { consumeRateLimit } from '../rate-limit/rateLimit.ts';
import type { ContextoApi, DbRpc } from './auth.ts';
import { exigirPermissao } from './auth.ts';
import {
  bytesDoPdf,
  limparMensagem,
  nomeDoPdf,
  type PedirPdfFatura,
  respostaPdf,
} from './faturaPdf.ts';
import type { ArmazemDocumentos } from './armazemDocumentos.ts';
import { eTipoDocumento, guardarRascunho, servirDocumento } from './contaCandidatura.ts';
import type { Rota } from './router.ts';
import { erro, ok, respostaLimite } from './respostas.ts';
import { confirmarSessao, lerTokenSessao, type VerificadorSessao } from './sessao.ts';
import { erroDoSql, falhouRpc } from './sql.ts';

// Cada PDF pode ocupar o agente do Primavera até 40 s: 10 por minuto chega a uma pessoa.
export const LIMITE_PDF_POR_MINUTO = 10;
export const LIMITE_PDF_POR_ORG_MINUTO = 20;

const CODIGO = /^\d{1,12}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ROTAS_CONTA = [
  { metodo: 'GET', recurso: 'conta', comId: false, permissao: 'conta:read', rpc: 'api_conta' },
  {
    metodo: 'GET',
    recurso: 'conta/reservas',
    comId: false,
    permissao: 'conta:read',
    rpc: 'api_conta_reservas',
  },
  {
    metodo: 'DELETE',
    recurso: 'conta/reservas',
    comId: true,
    permissao: 'conta:write',
    rpc: 'api_conta_cancelar_reserva',
  },
  {
    metodo: 'GET',
    recurso: 'conta/candidatura',
    comId: false,
    permissao: 'conta:read',
    rpc: 'api_conta_candidatura',
  },
  {
    metodo: 'PUT',
    recurso: 'conta/candidatura',
    comId: false,
    permissao: 'conta:write',
    rpc: 'api_conta_candidatura_guardar',
  },
  {
    metodo: 'POST',
    recurso: 'conta/candidatura',
    comId: false,
    permissao: 'conta:write',
    rpc: 'api_conta_candidatura_submeter',
  },
  {
    metodo: 'POST',
    recurso: 'conta/candidatura-documentos',
    comId: true,
    permissao: 'conta:write',
    rpc: 'api_conta_candidatura',
  },
  {
    metodo: 'PUT',
    recurso: 'conta/candidatura-documentos',
    comId: true,
    permissao: 'conta:write',
    rpc: 'api_conta_candidatura_documento',
  },
  {
    metodo: 'DELETE',
    recurso: 'conta/candidatura-documentos',
    comId: true,
    permissao: 'conta:write',
    rpc: 'api_conta_candidatura_documento',
  },
  {
    metodo: 'GET',
    recurso: 'conta/faturas',
    comId: false,
    permissao: 'conta:read',
    rpc: 'api_conta_faturas',
  },
  {
    metodo: 'GET',
    recurso: 'conta/faturas',
    comId: true,
    permissao: 'conta:read',
    rpc: 'api_conta_fatura',
  },
] as const;

const MSG_FALHA = 'Falha a ler ou gravar os dados da conta. Tente de novo.';
const falhou = (rpc: string, error: unknown) => falhouRpc(rpc, error, MSG_FALHA);

/** Devolve a Response das rotas /conta*, ou null quando o recurso não é da conta. */
export async function servirConta(
  rota: Rota,
  req: Request,
  ctx: ContextoApi,
  db: DbRpc & VerificadorSessao,
  pedirPdf: PedirPdfFatura,
  armazem: ArmazemDocumentos | null = null
): Promise<Response | null> {
  if (rota.recurso !== 'conta' && !rota.recurso.startsWith('conta/')) return null;
  const resposta = await servir(rota, req, ctx, db, pedirPdf, armazem);
  // O PDF já traz "private, no-store"; o resto, erros incluídos, nunca vai para cache.
  if (!resposta.headers.has('Cache-Control')) resposta.headers.set('Cache-Control', 'no-store');
  return resposta;
}

async function servir(
  rota: Rota,
  req: Request,
  ctx: ContextoApi,
  db: DbRpc & VerificadorSessao,
  pedirPdf: PedirPdfFatura,
  armazem: ArmazemDocumentos | null
): Promise<Response> {
  const def = ROTAS_CONTA.find(
    (r) => r.recurso === rota.recurso && r.metodo === rota.metodo && r.comId === !!rota.id
  );
  if (!def) return erro('NAO_ENCONTRADO', 'Recurso inexistente.', 404);
  const recusaPermissao = exigirPermissao(ctx, def.permissao);
  if (recusaPermissao) return recusaPermissao;

  // Sem token não há conta: 401 antes de tudo o resto.
  const token = lerTokenSessao(req);
  if ('recusa' in token) return token.recusa;
  if (!token.token) {
    return erro(
      'SESSAO_INVALIDA',
      'Falta a sessão da conta: envie o access_token no cabeçalho X-Conta-Token.',
      401
    );
  }

  // Um tipo de documento desconhecido nunca existe: recusa sem ir ao GoTrue nem à base.
  if (def.recurso === 'conta/candidatura-documentos' && !eTipoDocumento(rota.id as string)) {
    return erro('PARAMETRO_INVALIDO', 'tipo de documento desconhecido.', 400);
  }

  // Um id com forma errada nunca existe: 404 sem ir ao GoTrue nem à base.
  if (rota.id !== null && def.recurso !== 'conta/candidatura-documentos') {
    const valido =
      def.recurso === 'conta/reservas'
        ? CODIGO.test(rota.id) && Number(rota.id) > 0
        : UUID.test(rota.id);
    if (!valido) {
      const qual = def.recurso === 'conta/reservas' ? 'Reserva' : 'Fatura';
      return erro('NAO_ENCONTRADO', `${qual} não encontrada.`, 404);
    }
  }

  const sessao = await confirmarSessao(db, token.token);
  if ('recusa' in sessao) return sessao.recusa;
  const base = { p_org_id: ctx.orgId, p_user_id: sessao.userId };

  if (def.recurso === 'conta/candidatura' && def.metodo === 'PUT') {
    return await guardarRascunho(req, ctx, db, base);
  }
  if (def.recurso === 'conta/candidatura-documentos') {
    const tipo = rota.id as Parameters<typeof servirDocumento>[1];
    return await servirDocumento(def.metodo, tipo, req, ctx, db, base, armazem);
  }

  if (def.rpc === 'api_conta_fatura') {
    return await pdfDaFatura(rota.id as string, ctx, db, base, pedirPdf);
  }

  const args =
    def.rpc === 'api_conta_cancelar_reserva' ? { ...base, p_codigo: Number(rota.id) } : base;
  const { data, error } = await db.rpc(def.rpc, args);
  if (error) return falhou(def.rpc, error);
  const recusa = erroDoSql(data);
  if (recusa) return recusa;
  const lista = def.rpc === 'api_conta_reservas' || def.rpc === 'api_conta_faturas';
  return ok(data ?? (lista ? [] : null), { semCache: true });
}

async function pdfDaFatura(
  invoiceId: string,
  ctx: ContextoApi,
  db: DbRpc,
  base: { p_org_id: string; p_user_id: string },
  pedirPdf: PedirPdfFatura
): Promise<Response> {
  // Cada PDF vai ao programa de faturação: limite próprio por conta e chave.
  const limite = await consumeRateLimit(db, {
    operation: 'api-rent-a-car-conta-pdf',
    identity: `${ctx.chaveId}:${base.p_user_id}`,
    limit: LIMITE_PDF_POR_MINUTO,
    windowSeconds: 60,
  });
  const recusaLimite = respostaLimite(
    limite,
    `Limite de ${LIMITE_PDF_POR_MINUTO} faturas por minuto excedido.`
  );
  if (recusaLimite) return recusaLimite;

  const { data, error } = await db.rpc('api_conta_fatura', { ...base, p_invoice_id: invoiceId });
  if (error) return falhou('api_conta_fatura', error);
  const recusa = erroDoSql(data);
  if (recusa) return recusa;
  const fatura = data as { id?: unknown; serie?: unknown; numero?: unknown } | null;
  if (!fatura || typeof fatura.id !== 'string') {
    return erro('NAO_ENCONTRADO', 'Fatura não encontrada.', 404);
  }

  // O Primavera serve os PDF pela mesma fila das emissões: tecto por organização,
  // contado só depois de confirmar que a fatura é do cliente.
  const limiteOrg = await consumeRateLimit(db, {
    operation: 'api-rent-a-car-conta-pdf-org',
    identity: ctx.orgId,
    limit: LIMITE_PDF_POR_ORG_MINUTO,
    windowSeconds: 60,
  });
  const recusaOrg = respostaLimite(
    limiteOrg,
    'Muitos pedidos de faturas. Tente dentro de um minuto.'
  );
  if (recusaOrg) return recusaOrg;

  const indisponivel = () => erro('ERRO_INTERNO', 'Fatura indisponível de momento.', 503);
  const pdf = await pedirPdf(fatura.id, ctx.orgId);
  if ('erro' in pdf) {
    console.error('[api-rent-a-car] PDF da fatura falhou:', {
      invoice_id: fatura.id,
      erro: limparMensagem(pdf.erro),
    });
    if (pdf.semPdf) return erro('NAO_ENCONTRADO', 'Esta fatura não tem PDF disponível.', 404);
    return indisponivel();
  }
  const bytes = bytesDoPdf(pdf.base64);
  if (!bytes) {
    console.error('[api-rent-a-car] PDF da fatura inválido:', { invoice_id: fatura.id });
    return indisponivel();
  }
  return respostaPdf(bytes, nomeDoPdf(fatura.serie, fatura.numero));
}
