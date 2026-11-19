# faturacao-emitir (faturação fiscal — provider-agnostic)

Emite documentos fiscais (FT / FR / NC / RC) no **software de faturação configurado por
organização** e grava o espelho local em `public.invoices`. Corre **server-side**.

Dois providers coexistem, cada organização escolhe o seu em `plataformas_configuracao.
config.provider` — nenhum interfere com o outro:

- **KeyInvoice** (`providers/keyinvoice.ts`) — completo: emit/pdf/voidReceipt para
  FT/FR/NC/RC. Liga-se DIRECTO à API do KeyInvoice (SaaS, acessível da internet).
- **Primavera pelo serviço** (`providers/primavera-servico.ts`) — FT, FR, RC e NC (total), por HTTPS
  directo ao serviço do Primavera (V10 no SRVAPP). Todas as rotas levam a empresa no caminho:
  `<servico_url>/<empresa>/faturas`, com a chave em `X-Api-Key`. Cada pedido leva uma chave
  contra duplicados (`ordem_id` = id da cobrança, `pagamento_id`, `nota_id`); repetir é seguro.
  O agente local e a fila da AS Connect foram retirados a 19/11/2026: uma integração sem
  `servico_url` já não emite e responde a pedir a configuração do serviço.

Para suportar outro software, adiciona-se um adapter em `providers/<nome>.ts` que
implemente `FaturacaoProvider` (ver `types.ts`) e regista-se no mapa `PROVIDERS` em
`index.ts`.

## Configuração (por organização, na app)

A config vive em `plataformas_configuracao` (RLS admin-only):

- `plataforma = 'faturacao'`, `ativo = true`
- `client_secret` = chave da API do provider. Para o Primavera é a chave do serviço (uma por empresa e ambiente),
  que o WeGest não gera.
- `config` (jsonb) = `{ provider, endpoint?, doctypes?, default_product?, default_idtax? }` para o KeyInvoice.
  Primavera: `{ provider, servico_url (https), empresa (dasprent, decada, distancia...), ambiente (teste|producao,
obrigatório), metodo_pagamento }`. Antes de cada emissão o `/saude` da empresa tem de bater com o ambiente
  (teste: `fiscal:false`; produção: `fiscal:true` e séries comunicadas); senão recusa.

O slug público (só para mostrar o nome na UI) fica em `org_definicoes.faturacao_provider`.

**Trocar de software = mudar na app** (Administração, Integrações, Faturação). Para o KeyInvoice, basta colar a chave.
Para o Primavera preenchem-se o endereço do serviço, a empresa, o ambiente e a chave.

## Primavera: o que o serviço aceita hoje

- Linhas só com IVA 23, 13 e 6%. IVA 0% é recusado antes de sair, porque o código de isenção (M01, M07...) é por
  empresa e decisão da contabilidade; o WeGest ainda não o guarda por linha.
- Nota de crédito só da fatura toda (ou do que falta dela): o serviço também aceita parciais por linha, mas isso
  precisa de saber a posição das linhas da fatura original, que o WeGest ainda não guarda.
- Consumidor final (sem NIF): até 1000,00 €; na Década Ousada ainda não está configurado no serviço.
- 503 com `tentar_de_novo`: o adapter repete o mesmo pedido até 3 vezes (3 s entre elas). Sem resposta, nunca
  repete: lê `GET /faturas?ordem_id=` e, se não consegue confirmar, falha como ambíguo (`EmissaoAmbiguaError`).
- A tabela `primavera_jobs` e a RPC `gerar_chave_agente_primavera` continuam na base (sem uso); retirá-las
  precisa de migração e de sim próprio.

## Chave da API — sem fallback global

A chave (`client_secret`) **não** tem fallback para nenhum secret do deployment — só a
config da própria organização é usada. Sem config, a emissão falha cedo e claro
(`"Chave do KeyInvoice não configurada."`), em vez de arriscar emitir pela conta de outra
organização. Cada org tem de configurar a sua própria chave em Integrações → Adicionar
Plataforma → KeyInvoice.

Os restantes valores (endpoint, doctypes, defaults) não identificam nenhuma organização e
continuam a aceitar secrets do deployment como valores por-defeito partilháveis:

```bash
supabase secrets set KI_DEFAULT_PRODUCT=<id/ref do artigo genérico>
# opcionais (têm defaults no adapter):
supabase secrets set KI_DOCTYPE_FT=4 KI_DOCTYPE_FR=34 KI_DOCTYPE_NC=7 KI_DOCTYPE_RC=<id>
supabase secrets set KI_DEFAULT_IDTAX=<id IVA de recurso>
supabase secrets set KEYINVOICE_ENDPOINT=<endpoint alternativo, se aplicável>
```

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` são injetados pelo runtime.

## Actions (body.action)

- **emit** (default) — `{ tipo, cliente, itens[], contrato_id?, cobranca_id?, observacoes?, referencia_externa?, documento_referencia? }`
- **health** — confirma que a chave autentica. Aceita credenciais de teste no body
  (`{ provider, apiKey, settings? }`) para testar **antes** de gravar na app.
- **pdf** — `{ invoice_id, provider_doctype?, provider_docnum?, serie?, signed? }` → `{ base64 }`.
  Com `invoice_id` o documento é o dessa fatura (da org de quem pede); sem ele, procura-se pelo
  número, que pode repetir-se entre empresas da mesma organização.

## Função legada `keyinvoice-emitir` — DESATIVADA

Esta função substituiu a antiga `keyinvoice-emitir`, que autenticava com um secret
GLOBAL (`KEYINVOICE_API_KEY`, uma chave para todas as orgs). Essa função foi
**desativada em produção** (redeployada como stub que responde `410 Gone`) porque era
uma porta lateral: permitia emitir pela chave global sem integração por-org. Toda a app
usa exclusivamente `faturacao-emitir`. Pode ser **apagada em definitivo**
(`supabase functions delete keyinvoice-emitir`), e o secret global `KEYINVOICE_API_KEY`
pode/deve ser removido — já não é lido por ninguém.

## Deploy

```bash
supabase db push
supabase functions deploy faturacao-emitir
# As funções primavera-agent-poll e primavera-agent-result já não existem no repositório; se ainda estiverem
# publicadas, retiram-se com `supabase functions delete` (só com o sim do dono).
```

## Smoke-test (KeyInvoice)

```bash
node scripts/faturacao-smoke.mjs          # authenticate + getTaxes + listProducts + ...
node scripts/faturacao-smoke.mjs --raw    # JSON cru
```
