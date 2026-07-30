# Auditoria de segurança — 2026-07-30

Projeto Supabase `hkqzzxgeedsmjnhyquke` (WeGest, 5 organizações em produção).
Todas as correcções estão **aplicadas e verificadas**. Sete migrações.

Desenho e raciocínio detalhado em
`docs/superpowers/specs/2026-07-30-isolamento-anon-causa-raiz-design.md`
(não versionado — o repo ignora `docs/**/*.md`).

---

## Resumo em números

Medido em produção no fim do trabalho.

| | antes | depois |
|---|---|---|
| Tabelas com SELECT para `anon` (de 174) | 172 | **0** |
| Funções `SECURITY DEFINER` da aplicação invocáveis por `anon` | 76 | **7** (allowlist) |
| Funções com EXECUTE para `anon` (de 485) | 445 | 230 — 223 delas de extensões |
| Códigos de organização enumeráveis por `anon` | 5 | **0** |
| Organizações que um funcionário vê além da sua | 4 | **0** |
| Injecção de leads noutra organização | possível | `42501` |
| Auto-promoção a administrador | 1 pedido `PATCH` | revertida por trigger |
| Políticas `rls_deny_anon` (rede nova) | 0 | 172 |
| Políticas `rls_org_isolation` (intactas) | 139 | 139 |

O ponto de partida era a fuga de 3631 linhas detectada a 2026-07-29 e já
corrigida nessa data. Confirmei primeiro que essa correcção estava aplicada:
restavam 8 linhas legíveis (`formularios` e `formulario_campanhas`, 4 cada). O
valor deste trabalho não foi fechar essas 8 — foi fechar as condições que as
produziram, e o que se encontrou pelo caminho.

---

## Os cinco problemas, por gravidade

### 1. Escalada de privilégios — qualquer utilizador virava administrador

**Não estava no âmbito pedido.** Apareceu ao mapear que tabelas o anónimo
alcança.

`Users can update their own profile` tinha `qual = (auth.uid() = id)` e nenhum
`with_check`. Num UPDATE o Postgres reutiliza o USING como check, e não havia
restrição de coluna — o utilizador escrevia qualquer coluna do seu próprio
perfil. Um `PATCH` a `profiles.cargo_id` apontando para um cargo com "admin" no
nome propagava-se por `trg_mirror_profile_role` para `user_organizacoes`, onde
`trg_uorg_sync_is_admin` punha `is_admin = true`. E `is_current_user_admin()` lê
exactamente esse campo; `has_permission()` devolve `true` a tudo quando ele é
verdadeiro. Ambos os triggers são `SECURITY DEFINER`, por isso a RLS de
`user_organizacoes` não os travava.

Encadeado com o registo público aberto (`disable_signup: false`,
`mailer_autoconfirm: true`) e com `handle_new_user_org` a aceitar `org_id` e
`cargo_id` da metadata do `signUp`, ia de "qualquer pessoa na internet" a
"administrador de qualquer uma das 5 organizações".

**A cadeia não foi executada** — escalava privilégios a sério em produção. Cada
elo foi confirmado por leitura do catálogo.

*Forense:* só 2 contas usaram `is_first_user` na metadata, ambas a 2025-06-03, o
dia genuíno do arranque. Sem sinais de exploração.

`20260730083944_fix_escalada_privilegios_anon.sql`

### 2. A torneira — os default privileges do schema `public`

Esta era a causa raiz do incidente de 29-07.

```
defaclrole=postgres,       objtype=r, acl={… anon=arwdDxtm/postgres …}
defaclrole=supabase_admin, objtype=r, acl={… anon=arwdDxtm/supabase_admin …}
```

`arwdDxtm` é SELECT, INSERT, UPDATE e DELETE. **Toda a tabela nova nascia com
grants totais para o anónimo** — daí 172 das 174 terem SELECT para `anon` sem
ninguém o ter decidido tabela a tabela.

Fechados os default privileges e revogados os grants, com uma política
`rls_deny_anon` (`RESTRICTIVE`, `TO anon`, `using (false)`) como rede nas 172
tabelas fora da allowlist. Negar explicitamente, e não depender de
`org_id = get_current_org_id()` dar NULL para o anónimo: se essa função passar a
devolver uma org por omissão, a negação implícita desaparece sem aviso.

Removida também a política `Qualquer um pode criar leads`
(`with check (true)`), que permitia **injectar leads em qualquer organização**.
Confirmado por POST anónimo: devolvia `409` (chave estrangeira), ou seja passava
a RLS.

`20260730084227_isolamento_anon_causa_raiz.sql`

### 3. Duas regressões causadas pela correcção 2

Ambas apanhadas pelas sondas pós-migração, antes de qualquer utilizador dar por
elas. **Nenhuma estava prevista.**

**O insert anónimo de leads parou** com `42501 permission denied for table
user_organizacoes`. As expressões de política são avaliadas com os privilégios
de *quem chama*: `Admins can manage leads` lia `profiles` inline, ler `profiles`
aciona `mt_profiles_select`, que referencia `user_organizacoes` — também inline.
Resolvido removendo a política redundante, **não** reconcedendo os grants.

**Os formulários públicos pararam** porque, sem `Qualquer um pode criar leads`, o
insert passou a exigir `org_id = DASPRENT` e nenhum dos dois formulários envia
`org_id`. Resolvido no default da coluna, não em dois ficheiros do frontend.

`20260730084755_fix_lead_anon_politica_encadeada.sql`
`20260730085024_leads_anon_org_default.sql`

### 4. Funções `SECURITY DEFINER` abertas ao anónimo

Uma função `SECURITY DEFINER` corre como o dono e **ignora a RLS por completo** —
nenhuma política a trava. Das 483 funções de `public`, 445 concediam EXECUTE a
`anon` e 431 a `PUBLIC`; 138 eram `SECURITY DEFINER`, das quais **76 invocáveis
por RPC** (as outras devolvem `trigger`, que o PostgREST não expõe). Entre as
invocáveis: `merge_motoristas`, `aprovar_candidatura_motorista`,
`get_email_api_key`, `set_email_api_key`, `manage_cron_job`,
`listar_colaboradores`, `gerar_contrato_atomico`.

Três descobertas mudaram a abordagem:

- **Revogar de `anon` não bastava.** 431 funções concediam a `PUBLIC`, e
  `REVOKE … FROM anon` não remove um grant dado a PUBLIC. Provado por ensaio:
  com apenas o revoke de anon, `get_current_org_id()` continuava acessível.
- **Revogar de `PUBLIC` é seguro para os autenticados.** 455 das 483
  concedem-lhes EXECUTE explicitamente; a única excepção é função de trigger.
- **Funções de trigger não precisam de EXECUTE do chamador.** O Postgres verifica
  esse privilégio quando o trigger é criado, não quando dispara. Confirmado por
  ensaio — sem isto teria reconcedido 62 funções sem necessidade.

`20260730090840_revoke_execute_anon_funcoes.sql`

### 5. `organizacoes` — códigos enumeráveis e leitura cruzada

Duas metades do mesmo problema, e a mesma causa que o incidente de 29-07: uma
política residual `USING (true)` a anular a camada correcta que estava por baixo.

**Metade anónima.** `anon` mantinha `select (id, nome, codigo, ativa)` para o
login por código funcionar, o que deixava `GET /organizacoes?select=codigo`
listar os códigos das 5 organizações. O código não é inócuo: é o que autoriza o
registo de motorista numa organização. Substituído por duas RPC estreitas —
`org_por_codigo(text)` e `org_codigo_disponivel(text)`. Continua a ser possível
**testar** um código de cada vez (inerente a deixar alguém escrever o código da
sua empresa), mas deixou de ser possível **listar**.

**Metade autenticada.** Demonstrado antes de corrigir: um utilizador **não-admin**
da Década Ousada lia as outras 4 organizações — NIF, morada, telefone e `codigo`.
Qualquer funcionário de qualquer um dos 5 clientes via os dados dos outros 4. As
políticas correctas já existiam (`Users podem ver orgs a que pertencem` e
`Decada Ousada admins podem gerir organizacoes`); a `Permitir verificar codigo de
org publicamente`, com `USING (true)`, tornava-as decorativas. A correcção foi um
`drop policy`.

`20260730091152_org_codigo_sem_enumeracao.sql`
`20260730093156_organizacoes_sem_leitura_cruzada.sql`

---

## O que ficou aberto ao anónimo, e porquê

Tudo o mais está fechado. Estas são as excepções, cada uma com um fluxo
verificado.

**Duas tabelas, só INSERT.** `leads_dasprent` (formulários públicos, restrito à
org DASPRENT por `anon_leads_insert`) e `login_attempts` (o registo de tentativas
corre com a sessão ainda anónima quando o login falha).

**Sete funções.** `formulario_publico_por_id` (`/formulario/:id`),
`validar_convite_token` e `marcar_convite_usado` (`/register`, pré-sessão),
`org_por_codigo` e `org_codigo_disponivel` (registo de motorista e de
organização), e — invocadas *dentro* de políticas e defaults, não pelo frontend —
`get_current_org_id()` e `is_current_user_admin()`, que devolvem `NULL`/`false`
ao anónimo.

**223 funções de extensões** (`btree_gist` 188, `pg_trgm` 31, `unaccent` 4).
Computam sobre os argumentos, não são `SECURITY DEFINER`, e pertencem ao
`supabase_admin` — o `postgres` não pode revogar grants feitos por ele.

---

## Como foi verificado

O que torna esta auditoria verificável, e vale a pena repetir:

- **Sondas anónimas por HTTP real**, com a chave pública do próprio Supabase, não
  inferência a partir do catálogo. `Prefer: count=exact` com `Range: 0-0` mede
  sem puxar dados pessoais.
- **Ensaios em transação terminada com `RAISE EXCEPTION`.** Garante rollback e
  traz o resultado na mensagem de erro. Foi assim que se testou a escalada de
  privilégios, os inserts anónimos e o revoke em massa das funções — sem escrever
  uma linha.
- **Controlos negativos.** O ensaio das funções só valeu depois de confirmar que
  `listar_colaboradores` ficava vedada. Sem isso, "os fluxos passam" podia
  significar apenas que a revogação não tinha surtido efeito — e não tinha.
- **Testar os fluxos legítimos, não só o ataque.** As duas regressões da secção 3
  só apareceram porque se testou o insert de leads. Verificar apenas que "o
  anónimo já não lê nada" teria deixado os formulários públicos mortos.

---

## Guarda contra regressões

`supabase/tests/rls_anon_exposure.test.sql` — 34 asserções. As estruturais
falham para **qualquer** tabela ou função nova que repita o padrão, não só para
as do incidente:

- 15-18: default privileges de tabelas, grants de `anon`, e `rls_deny_anon`
  presente em toda a tabela fora da allowlist;
- 29: default privileges de funções, nas duas vias (`anon` e `PUBLIC`);
- 30: nenhuma `SECURITY DEFINER` da aplicação executável por `anon` fora da
  allowlist.

A lógica das 34 foi validada como SQL contra produção — todas passam. O pgTAP em
si **não foi executado**: precisa de `supabase db start`, que precisa de Docker,
e o Docker não estava disponível.

Job `rls-test` acrescentado ao `.github/workflows/ci.yml`. **Ainda não correu.**
Validado sem Docker: a forma dos comandos, a existência de `supabase db start`, e
o `ci.yml` a ser interpretado com o job novo. Essa validação encontrou um erro
real — faltava `supabase db reset`, sem o qual os testes correriam contra um
schema vazio. Fica por provar o que só o runner prova; o workflow tem
`workflow_dispatch` e pode ser disparado à mão.

---

## Pendente

- **Regenerar `types.ts`** pelo workflow `regenerate-types.yml`. As três RPC
  novas não estão nos tipos; compila porque as chamadas usam
  `(supabase as any).rpc(...)`.
- **Correr o job `rls-test`** uma vez, para o validar.
- **`disable_signup: false`** é configuração do Auth, não da base de dados, e não
  deve ser desligada às cegas — `/motorista/registo` usa `signUp`. Com os
  problemas 1 e 4 fechados, uma conta criada da rua nasce sem privilégios e sem
  organização. Fica como decisão de produto, não como pendência de segurança.
- **`handle_new_user`** contém a versão antiga da falha de `is_admin`, mas não
  está ligada a nenhum trigger — é código morto. Deixada intacta para não
  misturar limpeza com correcção de segurança, e documentada como armadilha para
  quem a religar.
