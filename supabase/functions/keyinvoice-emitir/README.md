# keyinvoice-emitir  (KeyInvoice API 5.0 — REST)

Emite documentos fiscais (FT / FR / NC) no **KeyInvoice** e grava o espelho
local em `public.invoices`. Corre **server-side** — a api key vive como secret
do Supabase, nunca no browser.

## Protocolo (API5 REST)

```
POST https://login.keyinvoice.com/API5.php   Content-Type: application/json
authenticate  header  Apikey: <chave>   body {"method":"authenticate"}
              -> {Status:1, Sid:<sessão>}            (sessão dura 3600s)
restantes     header  Sid: <sessão>      body {"method":"...", ...}
              -> {Status:1, Data:{...}} | {Status:0, ErrorMessage}
```

Fluxo de emissão: `authenticate` → (NIF: `clientExists`/`insertClient` → IdClient) →
`getTaxes` (mapa taxa%→IdTax) → `insertDocument` → grava em `invoices`.
PDF é on-demand (`getDocumentPDF` devolve **base64**, action `pdf`).

## Actions (body.action)

- **emit** (default) — `{ tipo, cliente, itens[], contrato_id?, observacoes?, referencia_externa?, documento_referencia? }`
- **health** — confirma que a key autentica.
- **pdf** — `{ ki_doctype, ki_docnum, serie?, signed? }` → `{ base64 }`.

## Secrets / config

```bash
supabase secrets set KEYINVOICE_API_KEY=<chave API5>
supabase secrets set KI_DEFAULT_PRODUCT=<id/ref do artigo genérico>   # linhas de texto livre
# opcionais (defaults no código):
supabase secrets set KI_DOCTYPE_FT=4 KI_DOCTYPE_FR=5 KI_DOCTYPE_NC=6   # CONFIRMAR nos ANEXOS da doc
supabase secrets set KI_DEFAULT_IDTAX=<id IVA de recurso>
```

`SUPABASE_URL` / `SUPABASE_ANON_KEY` são injetados pelo runtime.

## Deploy

```bash
supabase db push
supabase functions deploy keyinvoice-emitir
```

## Smoke-test

```bash
node scripts/keyinvoice-smoke.mjs          # authenticate + getTaxes + listDocumentSeries + ...
node scripts/keyinvoice-smoke.mjs --raw     # JSON cru
```

## ⚠️ Por confirmar com a conta ativa

1. **Config da key** — precisa de **Utilizador** + **série por defeito** (senão `authenticate` dá
   "Configuração da chave API incompleta").
2. **DocType numérico** de FT/FR/NC — ver secção **ANEXOS** da doc; ajustar `KI_DOCTYPE_*`.
3. **IdProduct** — `insertDocument` exige `IdProduct` por linha. Como o WeGest usa linhas de
   texto livre, é preciso um **artigo genérico** no KeyInvoice (`KI_DEFAULT_PRODUCT`), com
   `ProductName` a sobrepor a descrição.
4. **IdTax** — mapeado de `getTaxes` (taxa%→Id). Confirmar a estrutura da resposta no smoke-test.
