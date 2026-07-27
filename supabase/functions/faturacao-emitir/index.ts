// ============================================================
// Edge Function: faturacao-emitir  (provider-agnostic)
// ============================================================
// Emite documentos fiscais (FT / FR / NC / RC) no software de faturação
// CONFIGURADO POR ORGANIZAÇÃO e grava o espelho local em `public.invoices`.
//
// É genérica: resolve a config da org (qual provider + chave) e despacha para
// o adapter correspondente. KeyInvoice é apenas um dos providers possíveis.
//
// Resolução da config (por org):
//   1) descobre a org do chamador via RPC get_current_org_id() (JWT do chamador) —
//      EXCETO quando o chamador é service-role E indica org_id explícito no body,
//      caso em que se usa esse org_id diretamente (workers internos, sem sessão de
//      utilizador para o RPC resolver — ver getOrgConfig);
//   2) lê a linha `plataformas_configuracao` (plataforma='faturacao', ativo) com
//      SERVICE ROLE (a RLS é admin-only; o utilizador que fatura pode não ser admin);
//   3) despacha para o adapter com a config da org (chave + settings).
// A CHAVE da API vem SEMPRE da org (client_secret) — NÃO há fallback para um
// secret global. Sem org resolvida ou sem config, a chave é vazia e a emissão
// falha cedo e claro ("Chave do <provider> não configurada"), em vez de
// arriscar emitir pela conta de outra organização. (Só valores não-sensíveis
// que não identificam ninguém — endpoint, doctypes, defaults — é que o adapter
// pode ainda buscar a secrets do deployment como predefinição partilhável.)
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
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { keyInvoiceProvider } from './providers/keyinvoice.ts';
import type { Cliente, EmitInput, FaturacaoProvider, Item, ProviderConfig } from './types.ts';
import { EmissaoAmbiguaError } from './types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const env = (k: string) => Deno.env.get(k);

// Registo de providers — adicionar aqui novos adapters (ex.: moloni, invoicexpress).
const PROVIDERS: Record<string, FaturacaoProvider> = {
  keyinvoice: keyInvoiceProvider,
};
const DEFAULT_PROVIDER = 'keyinvoice';

interface Body {
  action?: 'emit' | 'health' | 'pdf' | 'preflight';
  // emit
  tipo?: 'FT' | 'FR' | 'NC' | 'RC';
  cliente?: Cliente;
  itens?: Item[];
  contrato_id?: string;
  cobranca_id?: string;
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

/** Resolve { provider, cfg } da org. Sem org → sem chave (falha cedo e claro). */
async function getOrgConfig(
  req: Request,
  orgIdExplicito?: string
): Promise<{ provider: string; cfg: ProviderConfig; orgId: string | null }> {
  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  // `Boolean(serviceRoleKey)` evita que, com a env var por definir, o literal
  // "Bearer undefined" passe a autenticar como service role.
  const isServiceRole = Boolean(serviceRoleKey) && authHeader === `Bearer ${serviceRoleKey}`;

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

  if (!orgId) return { provider: DEFAULT_PROVIDER, cfg: { apiKey: null, settings: null }, orgId: null };

  const service = createClient(env('SUPABASE_URL') ?? '', env('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: row } = await service
    .from('plataformas_configuracao')
    .select('client_secret, config')
    .eq('plataforma', 'faturacao')
    .eq('ativo', true)
    .eq('org_id', orgId)
    .maybeSingle();

  const settings = ((row as any)?.config ?? null) as Record<string, unknown> | null;
  const provider = String((settings?.provider as string) || DEFAULT_PROVIDER).toLowerCase();
  return { provider, cfg: { apiKey: (row as any)?.client_secret ?? null, settings }, orgId };
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
      if (payload.apiKey || payload.provider) {
        // teste direto com credenciais fornecidas (antes de gravar na app)
        provider = String(payload.provider || DEFAULT_PROVIDER).toLowerCase();
        cfg = { apiKey: payload.apiKey ?? null, settings: { provider, ...(payload.settings ?? {}) } };
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
      const { provider, cfg } = await getOrgConfig(req, payload.org_id);
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

  // ── pdf (base64 on-demand) ──
  if (payload.action === 'pdf') {
    try {
      if (!payload.provider_doctype || !payload.provider_docnum) {
        return json({ success: false, error: 'pdf: provider_doctype e provider_docnum obrigatórios' });
      }
      const { provider, cfg } = await getOrgConfig(req, payload.org_id);
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
    return json({ success: false, error: 'tipo inválido (FT|FR|NC|RC)' });
  }
  if (!payload.itens?.length) return json({ success: false, error: 'Sem itens para faturar' });
  if ((payload.tipo === 'NC' || payload.tipo === 'RC') && !payload.documento_referencia) {
    return json({
      success: false,
      error: `${payload.tipo === 'RC' ? 'Recibo' : 'Nota de Crédito'} exige documento_referencia`,
    });
  }

  let docEmitido = false;
  try {
    const { provider, cfg, orgId } = await getOrgConfig(req, payload.org_id);
    const adapter = pickAdapter(provider);

    const emitInput: EmitInput = {
      tipo: payload.tipo,
      cliente: payload.cliente ?? ({} as Cliente),
      itens: payload.itens,
      observacoes: payload.observacoes,
      referencia_externa: payload.referencia_externa,
      documento_referencia: payload.documento_referencia,
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

    // Worker (service role) grava com service role e org_id explícito — o trigger
    // set_invoice_org_id não consegue resolver a org sem sessão de utilizador.
    // (Mesma guarda contra env var por definir que em getOrgConfig.)
    const emitServiceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
    const isServiceRole =
      Boolean(emitServiceRoleKey) &&
      (req.headers.get('Authorization') ?? '') === `Bearer ${emitServiceRoleKey}`;
    const supabase = isServiceRole
      ? createClient(env('SUPABASE_URL') ?? '', env('SUPABASE_SERVICE_ROLE_KEY') ?? '')
      : callerClient(req);
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
        numero: doc.numero || (doc.docnum || null),
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
