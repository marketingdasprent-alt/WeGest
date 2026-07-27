// ============================================================
// Adapter de faturação: KeyInvoice (API 5.0 — REST)
// ============================================================
// Implementa `FaturacaoProvider` para o KeyInvoice. O protocolo é o mesmo da
// função original; a config (chave, endpoint, doctypes, defaults) chega via
// `ProviderConfig` (da org).
//
// A CHAVE DA API NÃO TEM FALLBACK GLOBAL — é sempre a de `cfg.apiKey`
// (plataformas_configuracao.client_secret, por org), nunca um secret partilhado
// do deployment. Cada organização só consegue faturar com o KeyInvoice se
// tiver a própria chave configurada em Integrações; sem isso, falha cedo e
// claro (ver authenticate()), em vez de arriscar emitir pela conta de outra
// organização.
//
// Protocolo (doc API5):
//   POST <endpoint>   Content-Type: application/json
//   authenticate   header  Apikey: <chave>   body {"method":"authenticate"}
//                  -> {Status:1, Sid:<sessão>}            (sessão dura 3600s)
//   restantes      header  Sid: <sessão>      body {"method":"...", ...}
//                  -> {Status:1, Data:{...}} | {Status:0, ErrorMessage}
//
// Settings (plataformas_configuracao.config) — todos opcionais:
//   { provider:'keyinvoice', endpoint?, doctypes?:{FT,FR,NC,RC}, default_product?, default_idtax? }
// Estes (não a chave) continuam a aceitar fallback de secrets do deployment
// como valores por-defeito partilháveis: KEYINVOICE_ENDPOINT, KI_DOCTYPE_*,
// KI_DEFAULT_PRODUCT, KI_DEFAULT_IDTAX — não identificam nenhuma organização.
// ============================================================
import type {
  Cliente,
  EmitDocResult,
  EmitInput,
  FaturacaoProvider,
  PdfInput,
  ProviderConfig,
} from '../types.ts';
import { EmissaoAmbiguaError } from '../types.ts';

const env = (k: string) => Deno.env.get(k);

const DEFAULT_ENDPOINT = 'https://login.keyinvoice.com/API5.php';
const CONSUMIDOR_FINAL = '999999990';

interface KIResponse {
  Status?: number;
  Sid?: string;
  Data?: any;
  ErrorMessage?: string;
}

const ok = (d: KIResponse) => Number(d?.Status) === 1;

/** Funde a config da org com os secrets do deployment e os defaults do adapter. */
function resolve(cfg: ProviderConfig) {
  const s = (cfg.settings ?? {}) as Record<string, any>;
  const dt = (s.doctypes ?? {}) as Record<string, any>;
  return {
    // Sem fallback a secret global — só a chave da própria organização.
    apiKey: String(cfg.apiKey || '').trim(),
    endpoint: String(s.endpoint || env('KEYINVOICE_ENDPOINT') || DEFAULT_ENDPOINT),
    doctypes: {
      FT: String(dt.FT ?? env('KI_DOCTYPE_FT') ?? '4'), // Fatura
      FR: String(dt.FR ?? env('KI_DOCTYPE_FR') ?? '34'), // Fatura-Recibo
      NC: String(dt.NC ?? env('KI_DOCTYPE_NC') ?? '7'), // Nota de Crédito
      RC: String(dt.RC ?? env('KI_DOCTYPE_RC') ?? ''), // Recibo (sem default)
    } as Record<string, string>,
    defaultProduct: String(s.default_product || env('KI_DEFAULT_PRODUCT') || ''),
    defaultIdTax: String(s.default_idtax || env('KI_DEFAULT_IDTAX') || ''),
  };
}

async function call(
  endpoint: string,
  method: string,
  params: Record<string, unknown>,
  auth: { apikey?: string; sid?: string }
): Promise<KIResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth.sid) headers.Sid = auth.sid;
  else if (auth.apikey) headers.Apikey = auth.apikey;

  const res = await fetch(endpoint, {
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

async function authenticate(apiKey: string, endpoint: string): Promise<string> {
  if (!apiKey) throw new Error('Chave do KeyInvoice não configurada.');
  const d = await call(endpoint, 'authenticate', {}, { apikey: apiKey });
  if (!ok(d) || !d.Sid) {
    throw new Error(`KeyInvoice authenticate falhou: ${d?.ErrorMessage || 'sem Sid'}`);
  }
  return d.Sid;
}

/** getTaxes -> mapa { taxa(%) : IdTax }. Tolerante a nomes de campos. */
async function buildTaxMap(endpoint: string, sid: string): Promise<Record<number, string>> {
  const map: Record<number, string> = {};
  try {
    const d = await call(endpoint, 'getTaxes', {}, { sid });
    const list = Array.isArray(d?.Data) ? d.Data : (d?.Data?.Taxes ?? d?.Data?.Items ?? []);
    for (const t of list as any[]) {
      const rate = Number(t.Tax ?? t.Rate ?? t.Value ?? t.Percentage ?? t.TaxValue ?? t.Iva);
      const id = String(t.Id ?? t.IdTax ?? t.Key ?? t.IdIva ?? '');
      if (!Number.isNaN(rate) && id) map[rate] = id;
    }
  } catch (_) {
    /* usa fallback */
  }
  return map;
}

/** Garante o cliente no KeyInvoice (NIF) e devolve IdClient; null = consumidor final. */
async function resolveIdClient(
  endpoint: string,
  sid: string,
  cliente: Cliente
): Promise<string | null> {
  const nif = (cliente.nif || '').trim();
  if (!nif || nif === CONSUMIDOR_FINAL) return null;

  const ex = await call(endpoint, 'clientExists', { VATIN: nif }, { sid });
  if (ok(ex) && ex.Data?.Id) return String(ex.Data.Id);

  const ins = await call(
    endpoint,
    'insertClient',
    {
      VATIN: nif,
      Name: cliente.nome || 'Cliente',
      Address: cliente.morada || '',
      PostalCode: cliente.codigo_postal || '',
      Locality: cliente.localidade || '',
      CountryCode: cliente.country_code || 'PT',
      Email: cliente.email || '',
    },
    { sid }
  );
  if (ok(ins) && ins.Data?.Id) return String(ins.Data.Id);

  throw new Error(
    `Não foi possível criar/obter o cliente (NIF ${nif}): ${ins?.ErrorMessage || ex?.ErrorMessage || 'erro'}`
  );
}

export const keyInvoiceProvider: FaturacaoProvider = {
  async health(cfg) {
    const r = resolve(cfg);
    await authenticate(r.apiKey, r.endpoint);
  },

  hasDoctype(tipo: EmitInput['tipo'], cfg) {
    const r = resolve(cfg);
    return Boolean(r.doctypes[tipo]);
  },

  async emit(input: EmitInput, cfg): Promise<EmitDocResult> {
    const r = resolve(cfg);
    if (input.tipo === 'RC' && !r.doctypes.RC) {
      throw new Error('Recibo (RC) não configurado: defina o doctype RC nas definições do provider.');
    }

    const cliente = input.cliente ?? ({} as Cliente);
    const sid = await authenticate(r.apiKey, r.endpoint);
    const idClient = await resolveIdClient(r.endpoint, sid, cliente);
    const taxMap = await buildTaxMap(r.endpoint, sid);

    const docLines = input.itens.map((it) => {
      const idProduct = it.id_produto || it.ref || r.defaultProduct;
      const idTax = it.id_tax || taxMap[Number(it.taxa_iva)] || r.defaultIdTax;
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

    const comments = [input.observacoes, input.referencia_externa].filter(Boolean).join(' | ');
    const doc: Record<string, unknown> = {
      DocType: r.doctypes[input.tipo],
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
      ...(input.documento_referencia ? { DocReference: input.documento_referencia } : {}),
    };

    let res: KIResponse;
    try {
      res = await call(r.endpoint, 'insertDocument', doc, { sid });
    } catch (e) {
      // A chamada em si falhou a nível de TRANSPORTE (rede, resposta não-JSON)
      // — não se sabe se o KeyInvoice chegou a criar o documento antes da
      // falha. NUNCA reemitir sem reconciliar primeiro.
      throw new EmissaoAmbiguaError(`insertDocument: falha de transporte — ${(e as Error).message}`);
    }
    if (!ok(res)) {
      // O provider RESPONDEU e recusou explicitamente o pedido (Status !== 1)
      // — confirma-se que nada foi criado.
      throw new Error(`insertDocument falhou: ${res?.ErrorMessage || 'recusado'}`);
    }
    if (!res.Data) {
      // O provider respondeu Status OK mas sem Data — não é uma recusa. É
      // impossível confirmar se o documento chegou a ser criado; nunca
      // reemitir sem reconciliar primeiro.
      throw new EmissaoAmbiguaError(
        'insertDocument: provider respondeu Status OK sem Data — impossível confirmar se o documento foi criado.'
      );
    }
    const { DocType, DocSeries, DocNum, FullDocNumber } = res.Data as {
      DocType: string;
      DocSeries: string;
      DocNum: string;
      FullDocNumber: string;
    };

    return {
      doctype: String(DocType ?? r.doctypes[input.tipo]),
      docnum: DocNum != null ? String(DocNum) : '',
      serie: DocSeries != null ? String(DocSeries) : '',
      numero: FullDocNumber ?? (DocNum != null ? String(DocNum) : ''),
      raw: res.Data,
    };
  },

  async pdf(input: PdfInput, cfg): Promise<string> {
    const r = resolve(cfg);
    const sid = await authenticate(r.apiKey, r.endpoint);
    const d = await call(
      r.endpoint,
      'getDocumentPDF',
      {
        DocType: input.doctype,
        DocNum: input.docnum,
        ...(input.serie ? { DocSeries: input.serie } : {}),
        Format: 'A4',
        ...(input.signed ? { Signed: 1 } : {}),
      },
      { sid }
    );
    if (!ok(d) || !d.Data?.DocumentBinary) {
      throw new Error(d?.ErrorMessage || 'PDF indisponível');
    }
    return d.Data.DocumentBinary as string;
  },
};
