// ============================================================
// Edge Function: keyinvoice-emitir  (KeyInvoice API 5.0 — REST)
// ============================================================
// Emite um documento fiscal (FT / FR / NC) no KeyInvoice e grava o
// espelho local em `public.invoices`. Corre SERVER-SIDE — a api key
// vive como secret do Supabase (KEYINVOICE_API_KEY), nunca no browser.
//
// Protocolo (doc API5):
//   POST https://login.keyinvoice.com/API5.php   Content-Type: application/json
//   authenticate   header  Apikey: <chave>   body {"method":"authenticate"}
//                  -> {Status:1, Sid:<sessão>}            (sessão dura 3600s)
//   restantes      header  Sid: <sessão>      body {"method":"...", ...}
//                  -> {Status:1, Data:{...}} | {Status:0, ErrorMessage}
//
// Actions (body.action):
//   'emit'  (default) — cria o documento. Body:
//       { tipo:'FT'|'FR'|'NC', cliente:{nome,nif?,email?,morada?,codigo_postal?,localidade?,country_code?},
//         itens:[{descricao,quantidade,preco_unitario,taxa_iva,ref?,id_produto?,id_tax?,desconto?}],
//         contrato_id?, cobranca_id?, observacoes?, referencia_externa?, documento_referencia? }
//   'health' — confirma que a key autentica.
//   'pdf'    — devolve o PDF (base64). Body: { ki_doctype, ki_docnum, serie?, signed? }
//
// Secrets/config (supabase secrets set ...):
//   KEYINVOICE_API_KEY   (obrigatório)  — a chave da API5
//   KI_DOCTYPE_FT/FR/NC  (numéricos; ver ANEXOS da doc). Default FT=4.
//   KI_DEFAULT_PRODUCT   (id/ref do artigo genérico p/ linhas de texto livre)
//   KI_DEFAULT_IDTAX     (id de IVA de recurso, se getTaxes não mapear)
// ============================================================
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ENDPOINT = 'https://login.keyinvoice.com/API5.php';
const env = (k: string) => Deno.env.get(k);

const DOCTYPE: Record<string, string> = {
  FT: env('KI_DOCTYPE_FT') || '4', // Fatura
  FR: env('KI_DOCTYPE_FR') || '34', // Fatura-Recibo
  NC: env('KI_DOCTYPE_NC') || '7', // Nota de Crédito
};

// ── REST helper ──────────────────────────────────────────────────────────────
interface KIResponse {
  Status?: number;
  Sid?: string;
  Data?: any;
  ErrorMessage?: string;
}

async function call(
  method: string,
  params: Record<string, unknown>,
  auth: { apikey?: string; sid?: string }
): Promise<KIResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth.sid) headers.Sid = auth.sid;
  else if (auth.apikey) headers.Apikey = auth.apikey;

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ method, ...params }),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as KIResponse;
  } catch {
    throw new Error(`KeyInvoice devolveu resposta não-JSON (${method}): ${text.slice(0, 200)}`);
  }
}

const ok = (d: KIResponse) => Number(d?.Status) === 1;

async function authenticate(): Promise<string> {
  const apikey = env('KEYINVOICE_API_KEY');
  if (!apikey) throw new Error('KEYINVOICE_API_KEY não configurada (secret do Supabase).');
  const d = await call('authenticate', {}, { apikey });
  if (!ok(d) || !d.Sid) {
    throw new Error(`KeyInvoice authenticate falhou: ${d?.ErrorMessage || 'sem Sid'}`);
  }
  return d.Sid;
}

// ── Tipos ────────────────────────────────────────────────────────────────────
interface Item {
  descricao: string;
  quantidade: number;
  preco_unitario: number;
  taxa_iva: number;
  ref?: string;
  id_produto?: string;
  id_tax?: string;
  desconto?: number;
}
interface Cliente {
  nome: string;
  nif?: string;
  email?: string;
  morada?: string;
  codigo_postal?: string;
  localidade?: string;
  country_code?: string;
}
interface EmitBody {
  action?: 'emit' | 'health' | 'pdf';
  tipo: 'FT' | 'FR' | 'NC';
  cliente: Cliente;
  itens: Item[];
  contrato_id?: string;
  cobranca_id?: string;
  observacoes?: string;
  referencia_externa?: string;
  documento_referencia?: string;
  // action 'pdf'
  ki_doctype?: string;
  ki_docnum?: string;
  serie?: string;
  signed?: boolean;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const CONSUMIDOR_FINAL = '999999990';

/** getTaxes -> mapa { taxa(%) : IdTax }. Tolerante a nomes de campos. */
async function buildTaxMap(sid: string): Promise<Record<number, string>> {
  const map: Record<number, string> = {};
  try {
    const d = await call('getTaxes', {}, { sid });
    const list = Array.isArray(d?.Data) ? d.Data : d?.Data?.Taxes ?? d?.Data?.Items ?? [];
    for (const t of list as any[]) {
      const rate = Number(t.Tax ?? t.Rate ?? t.Value ?? t.Percentage ?? t.TaxValue ?? t.Iva);
      const id = String(t.Id ?? t.IdTax ?? t.Key ?? t.IdIva ?? '');
      if (!Number.isNaN(rate) && id) map[rate] = id;
    }
  } catch (_) { /* usa fallback */ }
  return map;
}

/** Garante o cliente no KeyInvoice (NIF) e devolve IdClient; null = consumidor final. */
async function resolveIdClient(sid: string, cliente: Cliente): Promise<string | null> {
  const nif = (cliente.nif || '').trim();
  if (!nif || nif === CONSUMIDOR_FINAL) return null;

  const ex = await call('clientExists', { VATIN: nif }, { sid });
  if (ok(ex) && ex.Data?.Id) return String(ex.Data.Id);

  const ins = await call('insertClient', {
    VATIN: nif,
    Name: cliente.nome || 'Cliente',
    Address: cliente.morada || '',
    PostalCode: cliente.codigo_postal || '',
    Locality: cliente.localidade || '',
    CountryCode: cliente.country_code || 'PT',
    Email: cliente.email || '',
  }, { sid });
  if (ok(ins) && ins.Data?.Id) return String(ins.Data.Id);

  throw new Error(`Não foi possível criar/obter o cliente (NIF ${nif}): ${ins?.ErrorMessage || ex?.ErrorMessage || 'erro'}`);
}

// ── Handler ──────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Método não suportado' }, 405);

  let payload: EmitBody;
  try {
    payload = await req.json();
  } catch {
    return json({ success: false, error: 'Body inválido (JSON esperado)' });
  }

  // ── health ──
  if (payload.action === 'health') {
    try {
      await authenticate();
      return json({ ok: true });
    } catch (e) {
      return json({ ok: false, error: (e as Error).message });
    }
  }

  // ── pdf (base64 on-demand) ──
  if (payload.action === 'pdf') {
    try {
      if (!payload.ki_doctype || !payload.ki_docnum) {
        return json({ success: false, error: 'pdf: ki_doctype e ki_docnum obrigatórios' });
      }
      const sid = await authenticate();
      const d = await call('getDocumentPDF', {
        DocType: payload.ki_doctype,
        DocNum: payload.ki_docnum,
        ...(payload.serie ? { DocSeries: payload.serie } : {}),
        Format: 'A4',
        ...(payload.signed ? { Signed: 1 } : {}),
      }, { sid });
      if (!ok(d) || !d.Data?.DocumentBinary) {
        return json({ success: false, error: d?.ErrorMessage || 'PDF indisponível' });
      }
      return json({ success: true, base64: d.Data.DocumentBinary });
    } catch (e) {
      return json({ success: false, error: (e as Error).message });
    }
  }

  // ── emit ──
  if (!payload?.tipo || !['FT', 'FR', 'NC'].includes(payload.tipo)) {
    return json({ success: false, error: 'tipo inválido (FT|FR|NC)' });
  }
  if (!payload.itens?.length) return json({ success: false, error: 'Sem itens para faturar' });
  if (payload.tipo === 'NC' && !payload.documento_referencia) {
    return json({ success: false, error: 'Nota de Crédito exige documento_referencia' });
  }

  const cliente = payload.cliente ?? ({} as Cliente);
  const defaultProduct = env('KI_DEFAULT_PRODUCT') || '';
  const defaultIdTax = env('KI_DEFAULT_IDTAX') || '';

  try {
    const sid = await authenticate();
    const idClient = await resolveIdClient(sid, cliente);
    const taxMap = await buildTaxMap(sid);

    const docLines = payload.itens.map((it) => {
      const idProduct = it.id_produto || it.ref || defaultProduct;
      const idTax = it.id_tax || taxMap[Number(it.taxa_iva)] || defaultIdTax;
      // KeyInvoice espera todos os valores como STRING (ver exemplos da doc)
      return {
        IdProduct: String(idProduct),
        ProductName: it.descricao,
        Qty: String(Number(it.quantidade) || 1),
        Price: String(Number(it.preco_unitario) || 0),
        ...(idTax ? { IdTax: String(idTax) } : {}),
        ...(it.desconto ? { Discount: String(Number(it.desconto)) } : {}),
      };
    });

    const comments = [payload.observacoes, payload.referencia_externa].filter(Boolean).join(' | ');
    const doc: Record<string, unknown> = {
      DocType: DOCTYPE[payload.tipo],
      DocLines: docLines,
      ...(idClient
        ? { IdClient: idClient }
        : {
            Name: cliente.nome || 'Consumidor Final',
            Address: cliente.morada || '',
            PostalCode: cliente.codigo_postal || '',
            Locality: cliente.localidade || '',
            CountryCode: cliente.country_code || 'PT',
          }),
      ...(comments ? { Comments: comments } : {}),
      ...(payload.documento_referencia ? { DocReference: payload.documento_referencia } : {}),
    };

    const res = await call('insertDocument', doc, { sid });
    if (!ok(res) || !res.Data) {
      throw new Error(`insertDocument falhou: ${res?.ErrorMessage || 'sem Data'}`);
    }
    const { DocType, DocSeries, DocNum, FullDocNumber } = res.Data as {
      DocType: string; DocSeries: string; DocNum: string; FullDocNumber: string;
    };

    // Total calculado a partir dos itens enviados
    const total = payload.itens.reduce((s, it) => {
      const base = (Number(it.quantidade) || 0) * (Number(it.preco_unitario) || 0);
      const comDesc = base * (1 - (Number(it.desconto) || 0) / 100);
      return s + comDesc * (1 + (Number(it.taxa_iva) || 0) / 100);
    }, 0);

    // Gravar espelho local — JWT do chamador p/ RLS + trigger org_id
    const supabase = createClient(
      env('SUPABASE_URL') ?? '',
      env('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    );

    const { data: invoice, error: dbErr } = await supabase
      .from('invoices')
      .insert({
        contrato_id: payload.contrato_id ?? null,
        cobranca_id: payload.cobranca_id ?? null,
        tipo: payload.tipo,
        ki_doctype: String(DocType ?? DOCTYPE[payload.tipo]),
        ki_docnum: DocNum != null ? String(DocNum) : null,
        serie: DocSeries != null ? String(DocSeries) : null,
        numero: FullDocNumber ?? (DocNum != null ? String(DocNum) : null),
        data_emissao: new Date().toISOString().slice(0, 10),
        total: Math.round(total * 100) / 100,
        cliente_nif: (cliente.nif || '').trim() || null,
        referencia_externa: payload.referencia_externa ?? null,
        observacoes: payload.observacoes ?? null,
        status: 'emitida',
        raw_response: res.Data,
      })
      .select()
      .single();

    if (dbErr) {
      return json({
        success: true,
        warning: `Documento emitido (${FullDocNumber ?? DocNum}) mas falhou gravar localmente: ${dbErr.message}`,
        keyinvoice: { DocType, DocSeries, DocNum, FullDocNumber, total },
      });
    }

    return json({ success: true, invoice, keyinvoice: { DocType, DocSeries, DocNum, FullDocNumber, total } });
  } catch (e) {
    return json({ success: false, error: (e as Error).message });
  }
});
