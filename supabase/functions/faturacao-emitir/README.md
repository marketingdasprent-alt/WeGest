# faturacao-emitir (faturação fiscal — provider-agnostic)

Emite documentos fiscais (FT / FR / NC / RC) no **software de faturação configurado por
organização** e grava o espelho local em `public.invoices`. Corre **server-side**.

Dois providers coexistem, cada organização escolhe o seu em `plataformas_configuracao.
config.provider` — nenhum interfere com o outro:

- **KeyInvoice** (`providers/keyinvoice.ts`) — completo: emit/pdf/voidReceipt para
  FT/FR/NC/RC. Liga-se DIRECTO à API do KeyInvoice (SaaS, acessível da internet).
- **Primavera V10, via AS Connect** (`providers/primavera.ts`) — só emissão de **FT**,
  e por uma FILA (`primavera_jobs`), não por ligação directa: o servidor Primavera de
  cada empresa cliente vive atrás de VPN interna, inacessível a partir de uma edge
  function na nuvem. Um AGENTE local, a correr dentro da rede da empresa
  (`agent/primavera-agent/`), faz a ponte — ver a secção "Arquitectura: agente local"
  abaixo. A documentação recebida do AS Connect (2026-07-30) também não mostra como
  escolher o tipo de documento nem endpoints de PDF/anulação — `pdf()`/`voidReceipt()`
  falham sempre, de propósito, até isso ficar confirmado. Ver os comentários no topo do
  ficheiro para a lista exacta do que está por confirmar (ver também a memória do
  projecto, `project_primavera-integration.md`).

Para suportar outro software, adiciona-se um adapter em `providers/<nome>.ts` que
implemente `FaturacaoProvider` (ver `types.ts`) e regista-se no mapa `PROVIDERS` em
`index.ts`.

## Configuração (por organização, na app)

A config vive em `plataformas_configuracao` (RLS admin-only):

- `plataforma = 'faturacao'`, `ativo = true`
- `client_secret` = chave da API do provider — para o Primavera, é a **chave do agente**
  (gerada pelo WeGest, prefixo `pva_`, RPC `gerar_chave_agente_primavera()`), NÃO a
  password do AS Connect. A password/username/enterprise do Primavera nunca estão nesta
  base de dados — ficam só na configuração local do agente.
- `config` (jsonb) = `{ provider, endpoint?, doctypes?, default_product?, default_idtax? }`
  — só usado pelo KeyInvoice; o Primavera não guarda nada aqui além de `{ provider }`.

O slug público (só para mostrar o nome na UI) fica em `org_definicoes.faturacao_provider`.

**Trocar de software = mudar na app.** Para o KeyInvoice, basta colar a chave. Para o
Primavera, a UI (Admin → Faturação → Integração) tem um botão "Gerar chave do agente" em
vez de um campo para colar — essa chave só serve para autenticar o agente a fazer poll,
nunca dá acesso a nada do Primavera por si só.

## Arquitectura: agente local (só o Primavera)

O servidor Primavera de cada empresa cliente costuma estar atrás de VPN interna — uma
edge function na nuvem não lhe consegue chegar directamente, e pedir a cada cliente que
exponha o seu servidor à internet não escala (é fricção de rede que a maioria não sabe
resolver, multiplicada por cada empresa nova). Em vez disso:

```
emit()/health() em providers/primavera.ts
    -> INSERT em primavera_jobs (status=pending)
    -> espera (poll curto, com timeout) até o job ficar done/failed

agente local (agent/primavera-agent/, dentro da rede do cliente)
    -> primavera-agent-poll  (pergunta "há trabalho?", autentica com a chave do agente)
    -> fala com o AS Connect LOCALMENTE (endereço da rede do cliente, nunca exposto)
    -> primavera-agent-result  (fecha o job: done/failed + resultado)
```

O agente liga-se sempre **para fora** (nunca precisa de porta aberta nem VPN especial —
atravessa qualquer firewall corporativo tal como um browser). Instruções completas para
configurar e correr o agente em `agent/primavera-agent/README.md`.

Timeouts de espera em `providers/primavera.ts` (`HEALTH_TIMEOUT_MS`, `EMIT_TIMEOUT_MS`):
se o job ainda estiver `pending` ao expirar, nenhum agente chegou a tocar-lhe (falha
CONHECIDA, seguro reagendar); se estiver `claimed`, o agente reclamou-o mas não reportou a
tempo (AMBÍGUO — `EmissaoAmbiguaError`, nunca reemitir sem confirmar directamente no
Primavera).

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
- **pdf** — `{ provider_doctype, provider_docnum, serie?, signed? }` → `{ base64 }`.

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
# Só se estiverem a mexer no Primavera:
supabase functions deploy primavera-agent-poll
supabase functions deploy primavera-agent-result
```

## Smoke-test (KeyInvoice)

```bash
node scripts/faturacao-smoke.mjs          # authenticate + getTaxes + listProducts + ...
node scripts/faturacao-smoke.mjs --raw    # JSON cru
```
