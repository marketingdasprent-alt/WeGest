# api-rent-a-car (API externa de rent-a-car, v1)

API pública para o site de cada organização: catálogo (localizações, categorias, modelos,
extras, coberturas) e, nas fases seguintes, disponibilidade, cotação e reservas. A função é
fina: autentica a chave, aplica o limite por minuto, encaminha e regista. Toda a regra de
negócio vive em funções SQL `api_*` (SECURITY DEFINER, `org_id` explícito, só `service_role`).

## Autenticação

Cabeçalho `X-API-Key: wg_ra_…` (ou `Authorization: Bearer wg_ra_…`). As chaves criam-se
em Integrações → Chaves de API (RPC `api_chaves_criar`); a base guarda só o sha256
(`api_chaves.api_key_hash`) e a chave em claro aparece uma única vez. Chave de outro escopo
(ex. `contabilidade`), desactivada, expirada ou fora da `ip_whitelist` → `403`.

## Base URL e rotas

- Produção: `https://wegest.pt/api/rent-a-car/v1/*` (rewrite no `vercel.json`).
- Directo: `https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/api-rent-a-car/v1/*`.
- `GET /openapi.json` é público; `GET /health` e o catálogo exigem chave com `catalogo:read`.
- Erros sempre `{ "erro": { "codigo", "mensagem", "detalhes"? } }`; `429` traz `Retry-After`.
- Cada pedido autenticado fica em `api_pedidos` (30 dias, sem corpo).

## Testes

`deno test --allow-read --allow-env --allow-net=127.0.0.1 --node-modules-dir=none supabase/functions/_shared/api-rent-a-car`
(auth, router, respostas, catálogo, OpenAPI). As funções SQL têm pgTAP em `supabase/tests/api_*.test.sql`.

## Publicar

`supabase/config.toml` tem `[functions.api-rent-a-car] verify_jwt = false` (a chave não é um JWT).

```bash
supabase functions deploy api-rent-a-car --project-ref hkqzzxgeedsmjnhyquke --use-api
```
