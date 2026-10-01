# Regressão SQL da auditoria F04–F06

`rpc_security.test.mjs` executa 10 cenários contra PostgreSQL real em memória
(PGlite 0.5.8). A fixture carrega do baseline as definições das tabelas envolvidas,
constraints locais, funções de autorização, RPCs e grants.
Depois aplica `20260925120246_endurecer_rpcs_auditoria_seguranca.sql` sem aceder à rede.

Instalação isolada, sem mudar as dependências da aplicação, em PowerShell:

```powershell
$pgRuntime = Join-Path $env:TEMP 'wegest-pglite-20260925'
New-Item -ItemType Directory -Path $pgRuntime -Force | Out-Null
pnpm --dir $pgRuntime add @electric-sql/pglite@0.5.8
$env:WEGEST_PGLITE_MODULE = Join-Path $pgRuntime 'node_modules/@electric-sql/pglite/dist/index.js'
node --test supabase/tests/rpc_security.test.mjs
```

Para reproduzir as falhas originais, executar a mesma suite com
`$env:WEGEST_RPC_BASELINE_ONLY = '1'`. O resultado esperado é falha nos cenários
de autorização, validação entre organizações, janela financeira e limite da fila.
Remover a variável antes de validar a migration:

```powershell
Remove-Item Env:WEGEST_RPC_BASELINE_ONLY
node --test supabase/tests/rpc_security.test.mjs
```

Cobertura: anon, authenticated sem permissão, editor com permissão, admins de A/B,
service role, chamadas do proprietário equivalentes ao cron e o trigger real de
entrada de reservas. Os testes verificam dados após recusas, rollback do
delete+insert, cache do cliente, contadores financeiros, idempotência e timeouts.
Incluem o wrapper `fn_slot_inserir_cobranca`, que também tinha acesso cliente.

Limites: a fixture não é um restauro integral do Supabase. Não carrega FKs para
tabelas fora do recorte, triggers alheios ao fluxo testado, PostgREST, Auth nem
pg_cron. `auth.uid()` lê os claims sintéticos da sessão. O PGlite tem uma conexão;
a concorrência entre processos e o deployment remoto continuam por verificar.
Esta suite é executada com Node, separadamente de `supabase test db` (pgTAP).

F03 (`salvar_precos_modelo_tarifa`) saiu desta suite: a correção aplicada em produção é
`20260925100000_salvar_precos_modelo_tarifa_protegido.sql`, coberta pelo pgTAP
`salvar_precos_modelo_tarifa.test.sql`.
