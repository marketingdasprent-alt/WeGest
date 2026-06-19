# faturacao-emitir (faturação fiscal — provider-agnostic)

Emite documentos fiscais (FT / FR / NC / RC) no **software de faturação configurado por
organização** e grava o espelho local em `public.invoices`. Corre **server-side**.

KeyInvoice é apenas **um** dos providers. Para suportar outro software, adiciona-se um
adapter em `providers/<nome>.ts` que implemente `FaturacaoProvider` (ver `types.ts`) e
regista-se no mapa `PROVIDERS` em `index.ts`.

## Configuração (por organização, na app)

A config vive em `plataformas_configuracao` (RLS admin-only):

- `plataforma = 'faturacao'`, `ativo = true`
- `client_secret` = chave da API do provider
- `config` (jsonb) = `{ provider, endpoint?, doctypes?, default_product?, default_idtax? }`

O slug público (só para mostrar o nome na UI) fica em `org_definicoes.faturacao_provider`.

**Trocar de software = mudar na app.** Para o KeyInvoice, basta a chave (endpoint/doctypes/
defaults vêm dos defaults do adapter).

## Fallback de secrets (transição / deployments single-tenant)

Se a org não tiver config, o adapter KeyInvoice cai nos secrets do deployment, para a
emissão continuar a funcionar:

```bash
supabase secrets set KEYINVOICE_API_KEY=<chave API5>
supabase secrets set KI_DEFAULT_PRODUCT=<id/ref do artigo genérico>
# opcionais (têm defaults no adapter):
supabase secrets set KI_DOCTYPE_FT=4 KI_DOCTYPE_FR=34 KI_DOCTYPE_NC=7 KI_DOCTYPE_RC=<id>
supabase secrets set KI_DEFAULT_IDTAX=<id IVA de recurso>
```

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` são injetados pelo runtime.

## Actions (body.action)

- **emit** (default) — `{ tipo, cliente, itens[], contrato_id?, cobranca_id?, observacoes?, referencia_externa?, documento_referencia? }`
- **health** — confirma que a chave autentica. Aceita credenciais de teste no body
  (`{ provider, apiKey, settings? }`) para testar **antes** de gravar na app.
- **pdf** — `{ provider_doctype, provider_docnum, serie?, signed? }` → `{ base64 }`.

## Deploy

```bash
supabase db push
supabase functions deploy faturacao-emitir
```

## Smoke-test (KeyInvoice)

```bash
node scripts/faturacao-smoke.mjs          # authenticate + getTaxes + listProducts + ...
node scripts/faturacao-smoke.mjs --raw    # JSON cru
```
