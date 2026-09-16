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

function isServiceRoleRequest(req: Request): boolean {
  const serviceRoleKey = env('SUPABASE_SERVICE_ROLE_KEY');
  return (
    Boolean(serviceRoleKey) &&
    (req.headers.get('Authorization') ?? '') === `Bearer ${serviceRoleKey}`
  );
}

const PROVIDERS: Record<string, FaturacaoProvider> = {
  keyinvoice: keyInvoiceProvider,
  primavera: primaveraProvider,
};
const DEFAULT_PROVIDER = 'keyinvoice';

interface Body {
  action?: 'emit' | 'health' | 'pdf' | 'preflight' | 'void_receipt';
  tipo?: 'FT' | 'FR' | 'NC' | 'RC';
  cliente?: Cliente;
  itens?: Item[];
  contrato_id?: string;
  cobranca_id?: string;
  observacoes?: string;
  referencia_externa?: string;
  documento_referencia?: string;
  org_id?: string;
  provider_doctype?: string;
  provider_docnum?: string;
  serie?: string;
  signed?: boolean;
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

function callerClient(req: Request) {
  return createClient(env('SUPABASE_URL') ?? '', env('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
}

async function getOrgConfig(
  req: Request,
  orgIdExplicito?: string,
  providerFiltro?: string
): Promise<{ provider: string; cfg: ProviderConfig; orgId: string | null }> {
  const isServiceRole = isServiceRoleRequest(req);

  let orgId: string | null = null;

  if (isServiceRole && orgIdExplicito) {
    orgId = orgIdExplicito;
  } else if (!isServiceRole) {
    try {
      const { data } = await callerClient(req).rpc('get_current_org_id');
      orgId = (data as string) ?? null;
    } catch {}
  }

  if (!orgId)
    return { provider: DEFAULT_PROVIDER, cfg: { apiKey: null, settings: null }, orgId: null };

  const service = createClient(env('SUPABASE_URL') ?? '', env('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  let query = service
    .from('plataformas_configuracao')
    .select('client_secret, config')
    .eq('plataforma', 'faturacao')
    .eq('org_id', orgId);
  query = providerFiltro ? query.eq('config->>provider', providerFiltro) : query.eq('ativo', true);
  const { data: row } = await query.maybeSingle();

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

  if (payload.action === 'health') {
    try {
      let provider: string;
      let cfg: ProviderConfig;
      if (payload.apiKey) {
        provider = String(payload.provider || DEFAULT_PROVIDER).toLowerCase();
        cfg = {
          apiKey: payload.apiKey ?? null,
          settings: { provider, ...(payload.settings ?? {}) },
        };
      } else if (payload.provider) {
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

  if (payload.action === 'void_receipt') {
    try {
      if (!payload.provider_docnum) {
        return json({ success: false, error: 'void_receipt: provider_docnum obrigatório' });
      }
      const { provider, cfg } = await getOrgConfig(req, payload.org_id);
      await pickAdapter(provider).voidReceipt(
        { docnum: payload.provider_docnum, docseries: payload.serie },
        cfg
      );
      return json({ success: true });
    } catch (e) {
      return json({ success: false, error: (e as Error).message });
    }
  }

  if (payload.action === 'pdf') {
    try {
      if (!payload.provider_doctype || !payload.provider_docnum) {
        return json({
          success: false,
          error: 'pdf: provider_doctype e provider_docnum obrigatórios',
        });
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
    const { provider, cfg, orgId } = await getOrgConfig(req, payload.org_id);
    const adapter = pickAdapter(provider);

    const isServiceRole = isServiceRoleRequest(req);
    const supabase = isServiceRole
      ? createClient(env('SUPABASE_URL') ?? '', env('SUPABASE_SERVICE_ROLE_KEY') ?? '')
      : callerClient(req);

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
    docEmitido = true;

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
    const ambiguo = docEmitido || e instanceof EmissaoAmbiguaError;
    return json({
      success: false,
      error: (e as Error).message,
      classe: ambiguo ? 'unknown' : 'known_failed',
    });
  }
});
