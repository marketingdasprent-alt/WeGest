# api-rent-a-car (API externa de rent-a-car, v1)

API pública para o site de cada organização: catálogo (localizações, categorias, modelos,
extras, coberturas) e, nas fases seguintes, disponibilidade, cotação e reservas. A função é
fina: autentica a chave, aplica o limite por minuto, encaminha e regista. Toda a regra de
negócio vive em funções SQL `api_*` (SECURITY DEFINER, `org_id` explícito, só `service_role`).

## Autenticação

Cabeçalho `X-API-Key: wg_ra_…` (ou `Authorization: Bearer wg_ra_…`). As chaves criam-se
em Integrações → Chaves de API (RPC `api_chaves_criar`); a base guarda só o sha256
(`api_chaves.api_key_hash`) e a chave em claro aparece uma única vez. Chave de outro escopo
(ex. `contabilidade`), desactivada, expirada ou fora da `ip_whitelist` → `403`. Erro da base
ao resolver a chave → `503` (nunca `401`).

**`ip_whitelist` só é fiável em chamadas directas** a
`https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/api-rent-a-car/v1/*`. Via
`api.wegest.pt` o pedido passa por um Cloudflare Worker e o IP que a função vê é do
Cloudflare, não o do servidor do site. Quem precisar de whitelist usa o URL directo.

## Limites

- `rate_limit_per_minute` da chave (120 por omissão, preso a 1..10000) depois de autenticar.
- 60 pedidos/min por IP (`api-rent-a-car-anon`) só para pedidos que falham a autenticação sem
  chave conhecida (401). Quem tem chave válida nunca gasta este balde: atrás de um proxy o IP
  é o mesmo para todos os sites.

## Base URL e rotas

- Produção: `https://api.wegest.pt/v1/*`, por um Cloudflare Worker (ver
  `cloudflare/api-wegest/README.md`). O Worker não guarda nada em cache e passa método, query,
  corpo e cabeçalhos tal como vêm.
- Directo: `https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/api-rent-a-car/v1/*`.
- `wegest.pt/api/rent-a-car/v1/*` (rewrite da Vercel) ainda existe, mas a firewall da Vercel
  desafia rajadas de pedidos (403 "Vercel Security Checkpoint"): não usar para integrações.
- `GET /v1` apresenta a API (`{ nome, versao, documentacao }`) e `GET /v1/openapi.json` é a
  especificação; ambos públicos. `GET /v1/health` e o catálogo exigem chave com
  `catalogo:read`.
- Erros sempre `{ "erro": { "codigo", "mensagem", "detalhes"? } }`; `429` traz `Retry-After`.
- Catálogo com `Cache-Control: private, max-age=300` e `Vary: Origin, X-API-Key, Authorization`
  (a resposta é por organização); só a apresentação e o `openapi.json` são `public`.
- CORS só para `https://wegest.pt`, `https://www.wegest.pt` e `https://docs.wegest.pt` (o
  "experimentar" da documentação).
- Cada pedido a `/v1/<recurso>` fica em `api_pedidos` (30 dias, sem corpo nem query string,
  caminho até 200 caracteres), recusas incluídas: `401` e `429` anónimo com org/chave a null,
  `403` e `429` da chave com a org e a chave em causa.

## Testes

`deno test --allow-read --allow-env --allow-net=127.0.0.1 --node-modules-dir=none supabase/functions/_shared/api-rent-a-car`
(auth, router, respostas, catálogo, OpenAPI, handler). As funções SQL têm pgTAP em
`supabase/tests/api_*.test.sql`. O Worker tem testes em `cloudflare/api-wegest/worker.test.js`
(correm no `pnpm test`).

## Publicar

`supabase/config.toml` tem `[functions.api-rent-a-car] verify_jwt = false` (a chave não é um JWT).

```bash
supabase functions deploy api-rent-a-car --project-ref hkqzzxgeedsmjnhyquke --use-api
```
