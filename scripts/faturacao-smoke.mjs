#!/usr/bin/env node
/**
 * Smoke-test do adapter de faturação KeyInvoice **API 5.0 (REST)** — ferramenta
 * de dev para validar o protocolo contra a conta. NÃO faz parte da app.
 *
 *   node scripts/faturacao-smoke.mjs           # authenticate + métodos read-only
 *   node scripts/faturacao-smoke.mjs --raw     # imprime o JSON cru de cada resposta
 *
 * Lê a chave de KEYINVOICE_API_KEY (env ou .env local, NÃO commitado).
 *
 * Protocolo (doc API5):
 *   POST https://login.keyinvoice.com/API5.php  Content-Type: application/json
 *   authenticate -> header  Apikey: <chave>      body {"method":"authenticate"}
 *                  resposta {Status:1, Sid:<sessão>}  (sessão dura 3600s)
 *   restantes    -> header  Sid: <sessão>         body {"method":"...", ...}
 *                  resposta {Status:1, Data:{...}} | {Status:0, ErrorMessage}
 */
import { readFileSync } from 'node:fs';

const RAW = process.argv.includes('--raw');

function readApiKey() {
  if (process.env.KEYINVOICE_API_KEY) return process.env.KEYINVOICE_API_KEY;
  const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
  const m = env.match(/^KEYINVOICE_API_KEY=(.+)$/m);
  if (!m) throw new Error('Sem KEYINVOICE_API_KEY (env ou .env)');
  return m[1].trim();
}
const API_KEY = readApiKey();
const ENDPOINT = 'https://login.keyinvoice.com/API5.php';

async function call(method, params = {}, sid = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (sid) headers.Sid = sid;
  else headers.Apikey = API_KEY;

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers,
    body: JSON.stringify({ method, ...params }),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (RAW) {
    console.log(`\n──── ${method} (HTTP ${res.status}) ────`);
    console.log(typeof data === 'string' ? data.slice(0, 1500) : JSON.stringify(data, null, 2));
  }
  return data;
}

async function main() {
  console.log(`Faturação (KeyInvoice API5) smoke-test — key …${API_KEY.slice(-6)}\n`);

  const auth = await call('authenticate');
  console.log('authenticate →', JSON.stringify(auth));
  const sid = auth?.Sid ?? auth?.sid;
  if (!sid) throw new Error('Sem Sid — ver resposta acima (Status/ErrorMessage).');
  console.log(`✅ Sid = ${String(sid).slice(0, 14)}…\n`);

  // Read-only: dados úteis para construir o insertDocument
  for (const m of ['company', 'getTaxes', 'listPaymentMethods', 'countProducts', 'listProducts']) {
    try {
      const r = await call(m, m === 'listProducts' ? { offset: '0' } : {}, sid);
      console.log(`${m} →`, JSON.stringify(r).slice(0, 600));
    } catch (e) {
      console.log(`${m} ✗`, e.message);
    }
  }
  console.log('\n✅ Protocolo API5 confirmado.');

  // Criar artigo genérico via API: node scripts/faturacao-smoke.mjs --mkproduct
  if (process.argv.includes('--mkproduct')) {
    const ref = process.env.KI_TEST_PRODUCT || 'WEGEST';
    console.log(`\n── insertProduct (IdProduct "${ref}") ──`);
    const r = await call('insertProduct', {
      IdProduct: ref,
      Name: 'Serviços WeGest',
      IdTax: '1',        // 23%
      IsService: '1',
      HasStocks: '0',
      Price: '0',        // preço definido por linha no insertDocument
    }, sid);
    console.log('insertProduct →', JSON.stringify(r));
    if (Number(r?.Status) === 1) console.log(`✅ Artigo criado: IdProduct="${ref}"`);
    else console.log(`✗ ${r?.ErrorMessage}`);
    return;
  }

  // Emissão de teste real: node scripts/faturacao-smoke.mjs --emit  (KI_TEST_PRODUCT=<ref>)
  if (process.argv.includes('--emit')) {
    const product = process.env.KI_TEST_PRODUCT;
    if (!product) {
      console.log('\n⚠️  Define KI_TEST_PRODUCT=<ref do artigo genérico> para testar --emit.');
      return;
    }
    console.log(`\n── EMIT: Fatura (DocType 4) de teste, artigo "${product}" ──`);
    const doc = await call('insertDocument', {
      DocType: '4',
      Name: 'Consumidor Final',
      CountryCode: 'PT',
      Comments: 'Teste WeGest (smoke)',
      DocLines: [
        { IdProduct: product, ProductName: 'Serviço de teste WeGest', Qty: '1', Price: '10', IdTax: '1' },
      ],
    }, sid);
    console.log('insertDocument →', JSON.stringify(doc));
    if (Number(doc?.Status) !== 1) throw new Error(`insertDocument falhou: ${doc?.ErrorMessage}`);
    const { DocType, DocNum, DocSeries, FullDocNumber } = doc.Data || {};
    console.log(`✅ Emitido: ${FullDocNumber}  (DocType ${DocType}, DocNum ${DocNum}, Série ${DocSeries})`);

    const pdf = await call('getDocumentPDF', {
      DocType, DocNum, ...(DocSeries ? { DocSeries } : {}),
    }, sid);
    const b64 = pdf?.Data?.DocumentBinary;
    console.log(`getDocumentPDF → ${b64 ? `${b64.length} chars base64 ✅` : JSON.stringify(pdf)}`);
  }
}

main().catch((e) => { console.error('\n❌', e.message); process.exitCode = 1; });
