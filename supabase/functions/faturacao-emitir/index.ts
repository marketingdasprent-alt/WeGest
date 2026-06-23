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
//   1) descobre a org do chamador via RPC get_current_org_id() (JWT do chamador);
//   2) lê a linha `plataformas_configuracao` (plataforma='faturacao', ativo) com
//      SERVICE ROLE (a RLS é admin-only; o utilizador que fatura pode não ser admin);
//   3) o adapter aplica os seus defaults/fallbacks (ex.: secrets do deployment),
//      por isso a emissão continua a funcionar mesmo sem config na app.
// Se não se conseguir determinar a org, NÃO se lê nenhuma linha (evita misturar
// config entre tenants) — usa-se só o fallback de secrets do adapter.
//
// Actions (body.action):
//   'emit'  (default) — cria o documento e grava em `invoices`.
//   'health' — confirma que a chave autentica. Aceita credenciais de teste no
//              body ({ provider, apiKey, settings }) para testar ANTES de gravar.
//   'pdf'    — devolve o PDF (base64). Body: { provider_doctype, provider_docnum, serie?, signed? }
// ============================================================
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { keyInvoiceProvider } from './providers/keyinvoice.ts';
import type { Cliente, EmitInput, FaturacaoProvider, Item, ProviderConfig } from './types.ts';

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
  action?: 'emit' | 'health' | 'pdf';
  // emit
  tipo?: 'FT' | 'FR' | 'NC' | 'RC';
  cliente?: Cliente;
  itens?: Item[];
  contrato_id?: string;
  cobranca_id?: string;
  observacoes?: string;
  referencia_externa?: string;
  documento_referencia?: string;
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

/** Resolve { provider, cfg } da org do chamador. Sem org → só fallback de secrets. */
async function getOrgConfig(req: Request): Promise<{ provider: string; cfg: ProviderConfig }> {
  let orgId: string | null = null;
  try {
    const { data } = await callerClient(req).rpc('get_current_org_id');
    orgId = (data as string) ?? null;
  } catch {
    /* segue sem org */
  }
  if (!orgId) return { provider: DEFAULT_PROVIDER, cfg: { apiKey: null, settings: null } };

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
  return { provider, cfg: { apiKey: (row as any)?.client_secret ?? null, settings } };
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
        ({ provider, cfg } = await getOrgConfig(req));
      }
      await pickAdapter(provider).health(cfg);
      return json({ ok: true, provider });
    } catch (e) {
      return json({ ok: false, error: (e as Error).message });
    }
  }

  // ── pdf (base64 on-demand) ──
  if (payload.action === 'pdf') {
    try {
      if (!payload.provider_doctype || !payload.provider_docnum) {
        return json({ success: false, error: 'pdf: provider_doctype e provider_docnum obrigatórios' });
      }
      const { provider, cfg } = await getOrgConfig(req);
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

  try {
    const { provider, cfg } = await getOrgConfig(req);
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

    // Total calculado a partir dos itens enviados (provider-agnostic)
    const total = payload.itens.reduce((s, it) => {
      const base = (Number(it.quantidade) || 0) * (Number(it.preco_unitario) || 0);
      const comDesc = base * (1 - (Number(it.desconto) || 0) / 100);
      return s + comDesc * (1 + (Number(it.taxa_iva) || 0) / 100);
    }, 0);

    // Gravar espelho local — JWT do chamador p/ RLS + trigger org_id
    const supabase = callerClient(req);
    const cliente = payload.cliente ?? ({} as Cliente);

    const { data: invoice, error: dbErr } = await supabase
      .from('invoices')
      .insert({
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
    return json({ success: false, error: (e as Error).message });
  }
});
