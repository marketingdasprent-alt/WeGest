// ============================================================
// Edge Function: faturacao-emitir  (provider-agnostic)
// ============================================================
// Emite documentos fiscais (FT / FR / NC / RC) no software de faturação DA
// EMPRESA QUE ASSINA O DOCUMENTO e grava o espelho local em `public.invoices`.
//
// É genérica: resolve a config da empresa (qual provider + chave) e despacha
// para o adapter correspondente. KeyInvoice é apenas um dos providers.
//
// POR EMPRESA, não por organização (desde 2026-09-17). Quem emite uma factura
// é a empresa emissora do contrato (`contratos_renting.emissor_id` →
// `clientes.is_emissora`), cada uma com o seu NIF e a sua conta no software de
// facturação. Uma organização tem várias. Até esta data havia uma só chave por
// organização, e em produção uma única conta KeyInvoice tinha emitido 199
// facturas em nome de CINCO empresas diferentes.
//
// Resolução da config:
//   1) descobre a org do chamador via RPC get_current_org_id() (JWT do chamador) —
//      EXCETO quando o chamador é service-role E indica org_id explícito no body,
//      caso em que se usa esse org_id diretamente (workers internos, sem sessão de
//      utilizador para o RPC resolver — ver getOrgConfig);
//   2) descobre a EMPRESA do documento (ver resolverEmissorId): o que o body
//      disser, senão o contrato, senão a cobrança (contrato ou reserva), senão
//      — para PDF e anulação — a factura já emitida;
//   3) lê a linha `plataformas_configuracao` (plataforma='faturacao', ativo,
//      emissor_id) com SERVICE ROLE (a RLS é admin-only; quem fatura pode não
//      ser admin);
//   4) despacha para o adapter com a config dessa empresa (chave + settings).
//
// A CHAVE vem SEMPRE da empresa (client_secret) — NÃO há fallback para um
// secret global nem para a chave de outra empresa. Sem empresa resolvida, ou
// com uma empresa que não tem integração, a emissão falha cedo e claro: emitir
// pela conta de outra empresa poria o NIF errado num documento fiscal. (Só
// valores não-sensíveis que não identificam ninguém — endpoint, doctypes,
// defaults — é que o adapter pode ainda buscar a secrets do deployment.)
//
// Actions (body.action):
//   'emit'  (default) — cria o documento e grava em `invoices`.
//   'health' — confirma que a chave autentica. Aceita credenciais de teste no
//              body ({ provider, apiKey, settings }) para testar ANTES de gravar.
//   'preflight' — confirma que a org tem o Recibo (RC) configurado e a chave
//                 autentica, ANTES de se criar um acordo de parcelamento.
//   'pdf'    — devolve o PDF (base64). Body: { provider_doctype, provider_docnum, serie?, signed? }
// ============================================================
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.105.4';
import { keyInvoiceProvider } from './providers/keyinvoice.ts';
import { primaveraProvider } from './providers/primavera.ts';
import type { Cliente, EmitInput, FaturacaoProvider, Item, ProviderConfig } from './types.ts';
import { EmissaoAmbiguaError } from './types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const env = (k: string) => Deno.env.get(k);

/** Confirma se o pedido vem autenticado com a service role key (workers internos).
 *  `Boolean(serviceRoleKey)` evita que, com a env var por definir, o literal
 *  "Bearer undefined" passe a autenticar como service role. */
function isServiceRoleRequest(req: Request): boolean {
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  return (
    Boolean(serviceRoleKey) &&
    (req.headers.get('Authorization') ?? '') === `Bearer ${serviceRoleKey}`
  );
}

// Registo de providers — adicionar aqui novos adapters (ex.: moloni, invoicexpress).
const PROVIDERS: Record<string, FaturacaoProvider> = {
  keyinvoice: keyInvoiceProvider,
  primavera: primaveraProvider,
};
const DEFAULT_PROVIDER = 'keyinvoice';

interface Body {
  action?: 'emit' | 'health' | 'pdf' | 'preflight' | 'void_receipt';
  // emit
  tipo?: 'FT' | 'FR' | 'NC' | 'RC';
  cliente?: Cliente;
  itens?: Item[];
  contrato_id?: string;
  cobranca_id?: string;
  /** Empresa emissora (clientes.is_emissora). Opcional: o servidor resolve-a a
   *  partir do contrato/cobrança quando não vier. É ela que escolhe a chave. */
  emissor_id?: string;
  observacoes?: string;
  referencia_externa?: string;
  documento_referencia?: string;
  /**
   * Organização em nome da qual emitir. SÓ é aceite de um chamador service-role
   * (workers internos). De um utilizador seria escalada de tenant — emitiria
   * pela conta de faturação de outra organização.
   */
  org_id?: string;
  // pdf
  provider_doctype?: string;
  provider_docnum?: string;
  serie?: string;
  signed?: boolean;
  // health (teste de ligação com credenciais ainda não gravadas)
  provider?: string;
  apiKey?: string;
  settings?: Record<string, unknown>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Cliente Supabase com o JWT do chamador (p/ RLS + trigger de org_id). */
function callerClient(req: Request) {
  return createClient(env('SUPABASE_URL') ?? '', env('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
}

/** Cliente com service role — a RLS de `plataformas_configuracao` é admin-only
 *  e quem fatura pode não ser admin. */
function serviceClient() {
  return createClient(env('SUPABASE_URL') ?? '', env('SUPABASE_SERVICE_ROLE_KEY') ?? '');
}

/**
 * Descobre a EMPRESA EMISSORA do documento — quem o assina fiscalmente.
 *
 * Quem emite não é a organização, é a empresa (`clientes.is_emissora`) a que o
 * contrato ou a reserva aponta. Uma organização tem várias, cada uma com o seu
 * NIF e a sua conta no software de facturação, e é por isso que a chave da API
 * se escolhe por empresa e não por organização.
 *
 * Ordem: o que o chamador disser explicitamente, senão o contrato, senão a
 * cobrança (que leva ao contrato ou à reserva). Devolve null quando nenhuma
 * destas vias dá resposta — e sem empresa não se emite nada.
 */
async function resolverEmissorId(
  payload: Body,
  invoiceHint?: { provider_doctype?: string; provider_docnum?: string; serie?: string }
): Promise<string | null> {
  if (payload.emissor_id) return payload.emissor_id;
  const db = serviceClient();

  if (payload.contrato_id) {
    const { data } = await db
      .from('contratos_renting')
      .select('emissor_id')
      .eq('id', payload.contrato_id)
      .maybeSingle();
    if (data?.emissor_id) return data.emissor_id as string;
  }

  if (payload.cobranca_id) {
    const { data: cob } = await db
      .from('contrato_cobrancas')
      .select('contrato_id, reserva_id')
      .eq('id', payload.cobranca_id)
      .maybeSingle();
    if (cob?.contrato_id) {
      const { data } = await db
        .from('contratos_renting')
        .select('emissor_id')
        .eq('id', cob.contrato_id)
        .maybeSingle();
      if (data?.emissor_id) return data.emissor_id as string;
    }
    if (cob?.reserva_id) {
      const { data } = await db
        .from('reservas')
        .select('emissor_id')
        .eq('id', cob.reserva_id)
        .maybeSingle();
      if (data?.emissor_id) return data.emissor_id as string;
    }
  }

  // PDF e anulação de recibo referem um documento JÁ emitido: a empresa é a
  // que o emitiu, e isso está no espelho local.
  if (invoiceHint?.provider_docnum) {
    let q = db
      .from('invoices')
      .select('contrato_id')
      .eq('provider_docnum', invoiceHint.provider_docnum);
    if (invoiceHint.provider_doctype) q = q.eq('provider_doctype', invoiceHint.provider_doctype);
    if (invoiceHint.serie) q = q.eq('serie', invoiceHint.serie);
    const { data: inv } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (inv?.contrato_id) {
      const { data } = await db
        .from('contratos_renting')
        .select('emissor_id')
        .eq('id', inv.contrato_id)
        .maybeSingle();
      if (data?.emissor_id) return data.emissor_id as string;
    }
  }

  return null;
}

/** Erro de configuração: a empresa do documento não tem software de faturação
 *  ligado. Não é falha técnica, é uma coisa que alguém tem de ir configurar. */
class EmpresaSemFaturacaoError extends Error {}

/**
 * Resolve { provider, cfg } da EMPRESA que vai emitir. Sem org ou sem empresa
 * com integração → sem chave, e a emissão falha cedo e claro.
 *
 * Sem `providerFiltro`: lê a integração de faturação ATIVA DA EMPRESA — há uma
 * por empresa (índice uq_faturacao_ativa_por_emissor, migração
 * 20260917150000_faturacao_por_empresa_emissora.sql). Uma empresa sem
 * integração não pode ser faturada: emitir pela conta de outra empresa poria
 * o NIF errado num documento fiscal.
 *
 * Com `providerFiltro`: lê a linha desse provider especificamente, ativa ou
 * não — usado pelo teste de ligação ("Testar ligação" no diálogo), para
 * testar a integração que se está a CONFIGURAR (ex.: Primavera ainda não
 * promovida a ativa) sem depender de qual delas está em produção agora.
 */
async function getOrgConfig(
  req: Request,
  orgIdExplicito?: string,
  providerFiltro?: string,
  emissorId?: string | null
): Promise<{ provider: string; cfg: ProviderConfig; orgId: string | null }> {
  const isServiceRole = isServiceRoleRequest(req);

  let orgId: string | null = null;

  if (isServiceRole && orgIdExplicito) {
    // Worker interno a emitir em nome de uma org concreta.
    orgId = orgIdExplicito;
  } else if (!isServiceRole) {
    // Utilizador normal: a org vem SEMPRE do JWT, nunca do body.
    try {
      const { data } = await callerClient(req).rpc('get_current_org_id');
      orgId = (data as string) ?? null;
    } catch {
      /* segue sem org */
    }
  }

  if (!orgId)
    return { provider: DEFAULT_PROVIDER, cfg: { apiKey: null, settings: null }, orgId: null };

  const service = serviceClient();
  let query = service
    .from('plataformas_configuracao')
    .select('client_secret, config')
    .eq('plataforma', 'faturacao')
    .eq('org_id', orgId);
  if (providerFiltro) {
    // Testar credenciais de uma integração concreta: a empresa é a que a
    // própria linha tiver, não se filtra por ela.
    query = query.eq('config->>provider', providerFiltro);
    if (emissorId) query = query.eq('emissor_id', emissorId);
  } else {
    // Emitir a sério: a chave TEM de ser a da empresa do documento.
    if (!emissorId) {
      throw new EmpresaSemFaturacaoError(
        'Não foi possível determinar a empresa emissora deste documento. ' +
          'Verifique a empresa no contrato ou na reserva antes de faturar.'
      );
    }
    query = query.eq('ativo', true).eq('emissor_id', emissorId);
  }
  const { data: row } = await query.maybeSingle();

  if (!providerFiltro && !row) {
    const { data: empresa } = await service
      .from('clientes')
      .select('nome')
      .eq('id', emissorId!)
      .maybeSingle();
    throw new EmpresaSemFaturacaoError(
      `${empresa?.nome ?? 'Esta empresa'} não tem software de faturação configurado. ` +
        'Ligue-lhe uma integração em Definições → Integrações antes de emitir documentos em nome dela.'
    );
  }

  const settings = ((row as any)?.config ?? null) as Record<string, unknown> | null;
  const provider =
    providerFiltro || String((settings?.provider as string) || DEFAULT_PROVIDER).toLowerCase();
  return {
    provider,
    cfg: { apiKey: (row as any)?.client_secret ?? null, settings, orgId },
    orgId,
  };
}

function pickAdapter(provider: string): FaturacaoProvider {
  const adapter = PROVIDERS[provider];
  if (!adapter) throw new Error(`Provider de faturação desconhecido: ${provider}`);
  return adapter;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Método não suportado' }, 405);

  let payload: Body;
  try {
    payload = await req.json();
  } catch {
    return json({ success: false, error: 'Body inválido (JSON esperado)' });
  }

  // ── health ──
  if (payload.action === 'health') {
    try {
      let provider: string;
      let cfg: ProviderConfig;
      if (payload.apiKey) {
        // teste direto com credenciais fornecidas (antes de gravar na app)
        provider = String(payload.provider || DEFAULT_PROVIDER).toLowerCase();
        cfg = {
          apiKey: payload.apiKey ?? null,
          settings: { provider, ...(payload.settings ?? {}) },
        };
      } else if (payload.provider) {
        // testa a linha JÁ GRAVADA desse provider especificamente — pode não
        // ser a integração ativa (ex.: a testar o Primavera enquanto o
        // KeyInvoice continua em produção).
        ({ provider, cfg } = await getOrgConfig(req, payload.org_id, payload.provider));
      } else {
        ({ provider, cfg } = await getOrgConfig(req, payload.org_id));
      }
      await pickAdapter(provider).health(cfg);
      return json({ ok: true, provider });
    } catch (e) {
      return json({ ok: false, error: (e as Error).message });
    }
  }

  // ── preflight ──
  // Responde "esta org consegue emitir Recibos?" ANTES de se criar um acordo.
  // Falhar aqui custa um diálogo de erro; falhar depois de receber dinheiro
  // custa um problema contabilístico.
  if (payload.action === 'preflight') {
    try {
      const emissorId = await resolverEmissorId(payload);
      const { provider, cfg } = await getOrgConfig(req, payload.org_id, undefined, emissorId);
      const adapter = pickAdapter(provider);
      const rcConfigurado = adapter.hasDoctype('RC', cfg);

      if (!rcConfigurado) {
        return json({
          ok: false,
          provider,
          rc_configurado: false,
          error:
            'O documento "Recibo" não está configurado. Sem ele, os pagamentos das ' +
            'parcelas não podem ser registados legalmente.',
        });
      }

      await adapter.health(cfg);
      return json({ ok: true, provider, rc_configurado: true });
    } catch (e) {
      return json({ ok: false, rc_configurado: false, error: (e as Error).message });
    }
  }

  // ── void_receipt (anula um Recibo já emitido no provider) ──
  // Chamado a partir da anulação interna de um recibo (recibos.estado →
  // 'anulado') — sem isto, a liquidação real no KeyInvoice nunca é revertida
  // e a fatura original fica com "saldo pendente" errado lá (achado ao
  // testar manualmente, 30/07/2026).
  if (payload.action === 'void_receipt') {
    try {
      if (!payload.provider_docnum) {
        return json({ success: false, error: 'void_receipt: provider_docnum obrigatório' });
      }
      const emissorId = await resolverEmissorId(payload, {
        provider_docnum: payload.provider_docnum,
        serie: payload.serie,
      });
      const { provider, cfg } = await getOrgConfig(req, payload.org_id, undefined, emissorId);
      await pickAdapter(provider).voidReceipt(
        { docnum: payload.provider_docnum, docseries: payload.serie },
        cfg
      );
      return json({ success: true });
    } catch (e) {
      return json({ success: false, error: (e as Error).message });
    }
  }

  // ── pdf (base64 on-demand) ──
  if (payload.action === 'pdf') {
    try {
      if (!payload.provider_doctype || !payload.provider_docnum) {
        return json({
          success: false,
          error: 'pdf: provider_doctype e provider_docnum obrigatórios',
        });
      }
      const emissorId = await resolverEmissorId(payload, {
        provider_doctype: payload.provider_doctype,
        provider_docnum: payload.provider_docnum,
        serie: payload.serie,
      });
      const { provider, cfg } = await getOrgConfig(req, payload.org_id, undefined, emissorId);
      const base64 = await pickAdapter(provider).pdf(
        {
          doctype: payload.provider_doctype,
          docnum: payload.provider_docnum,
          serie: payload.serie ?? undefined,
          signed: payload.signed ?? undefined,
        },
        cfg
      );
      return json({ success: true, base64 });
    } catch (e) {
      return json({ success: false, error: (e as Error).message });
    }
  }

  // ── emit ──
  if (!payload?.tipo || !['FT', 'FR', 'NC', 'RC'].includes(payload.tipo)) {
    return json({ success: false, error: 'tipo inválido (FT|FR|NC|RC)', classe: 'known_failed' });
  }
  if (!payload.itens?.length) {
    return json({ success: false, error: 'Sem itens para faturar', classe: 'known_failed' });
  }
  if ((payload.tipo === 'NC' || payload.tipo === 'RC') && !payload.documento_referencia) {
    return json({
      success: false,
      error: `${payload.tipo === 'RC' ? 'Recibo' : 'Nota de Crédito'} exige documento_referencia`,
      classe: 'known_failed',
    });
  }

  let docEmitido = false;
  try {
    const emissorId = await resolverEmissorId(payload);
    const { provider, cfg, orgId } = await getOrgConfig(req, payload.org_id, undefined, emissorId);
    const adapter = pickAdapter(provider);

    // Worker (service role) grava com service role e org_id explícito — o trigger
    // set_invoice_org_id não consegue resolver a org sem sessão de utilizador.
    // Resolvido AQUI (não só mais abaixo) porque o Recibo precisa do mesmo
    // cliente já para a consulta a `invoices` antes de sequer chamar o adapter.
    const isServiceRole = isServiceRoleRequest(req);
    const supabase = isServiceRole
      ? createClient(env('SUPABASE_URL') ?? '', env('SUPABASE_SERVICE_ROLE_KEY') ?? '')
      : callerClient(req);

    // Recibo (RC): a KeyInvoice não usa "tipo de documento" próprio para
    // insertReceipt — referencia o documento ORIGINAL (FT/FR) por
    // DocType+DocSeries+DocNum. O chamador só manda `documento_referencia`
    // (o nº legal, ex. "4 4/90"); resolvemos aqui os 3 campos a partir do
    // nosso próprio espelho local (`invoices`), para nenhum chamador (cliente
    // web, worker) ter de conhecer o formato interno do provider.
    let documentoOriginal: EmitInput['documentoOriginal'];
    if (payload.tipo === 'RC') {
      const { data: original, error: originalErr } = await supabase
        .from('invoices')
        .select('provider_doctype, serie, provider_docnum')
        .eq('numero', payload.documento_referencia)
        .eq('cobranca_id', payload.cobranca_id ?? '')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (originalErr) throw originalErr;
      if (!original?.provider_doctype || !original?.provider_docnum) {
        return json({
          success: false,
          error: `Documento original "${payload.documento_referencia}" não encontrado — não é possível emitir o Recibo.`,
          classe: 'known_failed',
        });
      }
      documentoOriginal = {
        doctype: original.provider_doctype,
        serie: original.serie ?? '',
        docnum: original.provider_docnum,
      };
    }

    const emitInput: EmitInput = {
      tipo: payload.tipo,
      cliente: payload.cliente ?? ({} as Cliente),
      itens: payload.itens,
      observacoes: payload.observacoes,
      referencia_externa: payload.referencia_externa,
      documento_referencia: payload.documento_referencia,
      documentoOriginal,
    };
    const doc = await adapter.emit(emitInput, cfg);
    // A partir daqui o documento fiscal JÁ EXISTE no provider — qualquer falha
    // seguinte (gravar o espelho local, etc.) nunca pode ser 'known_failed'.
    docEmitido = true;

    // Total calculado a partir dos itens enviados (provider-agnostic)
    const total = payload.itens.reduce((s, it) => {
      const base = (Number(it.quantidade) || 0) * (Number(it.preco_unitario) || 0);
      const comDesc = base * (1 - (Number(it.desconto) || 0) / 100);
      return s + comDesc * (1 + (Number(it.taxa_iva) || 0) / 100);
    }, 0);

    const cliente = payload.cliente ?? ({} as Cliente);

    const { data: invoice, error: dbErr } = await supabase
      .from('invoices')
      .insert({
        ...(isServiceRole && orgId ? { org_id: orgId } : {}),
        contrato_id: payload.contrato_id ?? null,
        cobranca_id: payload.cobranca_id ?? null,
        tipo: payload.tipo,
        provider,
        provider_doctype: doc.doctype,
        provider_docnum: doc.docnum || null,
        serie: doc.serie || null,
        numero: doc.numero || doc.docnum || null,
        data_emissao: new Date().toISOString().slice(0, 10),
        total: round2(total),
        cliente_nif: (cliente.nif || '').trim() || null,
        referencia_externa: payload.referencia_externa ?? null,
        observacoes: payload.observacoes ?? null,
        status: 'emitida',
        raw_response: doc.raw,
      })
      .select()
      .single();

    const providerMeta = {
      DocType: doc.doctype,
      DocSeries: doc.serie,
      DocNum: doc.docnum,
      FullDocNumber: doc.numero,
      total,
    };

    if (dbErr) {
      return json({
        success: true,
        warning: `Documento emitido (${doc.numero || doc.docnum}) mas falhou gravar localmente: ${dbErr.message}`,
        provider: providerMeta,
      });
    }

    return json({ success: true, invoice, provider: providerMeta });
  } catch (e) {
    // known_failed = provado que nada foi criado (o provider respondeu e
    //   recusou, ou a falha ocorreu antes de sequer tentar criar) — seguro
    //   reagendar.
    // unknown = não se sabe se foi criado (falha de transporte durante a
    //   criação, OU falha DEPOIS de o adapter confirmar sucesso) — nunca
    //   reemitir sem reconciliar primeiro; o risco é um SEGUNDO documento
    //   fiscal legal sobre o mesmo pagamento.
    const ambiguo = docEmitido || e instanceof EmissaoAmbiguaError;
    return json({
      success: false,
      error: (e as Error).message,
      classe: ambiguo ? 'unknown' : 'known_failed',
    });
  }
});
