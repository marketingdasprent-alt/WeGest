# Reconstrução da base de dados e reconciliação de migrações

> Estado: **Fase 0 concluída no repositório, por verificar em ambiente com Docker.**
> Última actualização: 2026-08-28.

Este documento descreve o comportamento **real**, não o desejado. Onde alguma
coisa está por fazer ou por verificar, diz-se.

---

## 1. O problema que isto resolve

A auditoria de 2026-08-27 concluiu que o repositório não reproduzia a produção.
Duas causas concretas, ambas confirmadas contra a base de dados viva:

### 1.1 Carimbos de versão duplicados

`supabase_migrations.schema_migrations` tem `PRIMARY KEY (version)`. O
repositório tinha **59 carimbos partilhados por mais do que um ficheiro** — um
deles (`20260710100000`) por dez ficheiros.

Consequência: `supabase db reset` aborta com violação de chave primária no
segundo ficheiro de cada carimbo repetido. Não é um aviso — é uma paragem.

### 1.2 Migrações escritas contra uma base que já tinha o estado

Cerca de **280 ficheiros nunca foram registados** em produção. Foram escritos
já com o schema existente, e por isso não se aplicam de zero. O exemplo
canónico está documentado no próprio ficheiro
`20250811122918_0a61e2ff-…sql`: um backfill que referencia
`leads_dasprent.formulario_id`, coluna que **nenhuma migração cria** porque foi
acrescentada fora do sistema de migrações.

### 1.3 O efeito combinado

Nenhum teste de base de dados podia correr em CI, porque não havia base para os
correr. Foi assim que um erro real ficou latente 27 dias sem ninguém dar por
ele: `20260730095826` escrevia `v_run.event_type` quando `automation_runs` não
tem coluna `event_type`. Produção nunca teve essa versão — os logs mostram
execuções bem sucedidas todos os dias — mas qualquer reconstrução a partir do
repositório produzia um executor que rebentava em **todas** as execuções de
notificação, apanhado pelo `exception when others` e despejado em silêncio na
dead-letter.

---

## 2. O que foi feito

### 2.1 Bug latente corrigido

`supabase/migrations/20260730095826_isolar_notificacoes_e_automacao_por_org.sql`
passou de `v_run.event_type` para `v_rule.event_type`.

O ficheiro histórico foi **editado**, em vez de se acrescentar uma migração
correctiva. A regra normal é a oposta, e a excepção justifica-se: produção nunca
teve a versão partida, portanto isto não é uma mudança de comportamento — é
alinhar o repositório com o que foi realmente aplicado. Uma migração correctiva
no fim deixaria a cadeia a passar por um estado partido que nunca existiu.

### 2.2 Migrações órfãs recuperadas

Três migrações estavam aplicadas em produção sem ficheiro no ramo de trabalho:

| Versão em produção | Ficheiro | Origem |
|---|---|---|
| `20260826153601` | `apify_credenciais_partilhadas` | Recuperado do commit `941a6746`, re-carimbado (estava como `20260826160000`) |
| `20260827111017` | `ti_tickets_continuacao` | **Reconstruído** por introspecção |
| `20260827113930` | `ti_tickets_suporte_plataforma` | **Reconstruído** por introspecção |

«Reconstruído» significa: o efeito no schema é fiel, verificado coluna a coluna
contra `information_schema` e `pg_policies`; o texto **não** é o original, que
não existe em nenhum objecto git. Os ficheiros dizem-no no cabeçalho.

Depois disto, as 15 migrações de 26–27 de Agosto que produção tem estão todas
representadas no repositório com o carimbo certo.

### 2.3 Descoberta durante a reconstrução: excepção ao isolamento

Ao reconstruir `ti_tickets_suporte_plataforma` encontrou-se uma alteração ao
invariante multi-organização que não estava documentada em lado nenhum.

A política RESTRICTIVE `rls_org_isolation` é, em todo o schema,
`org_id = get_current_org_id()` e mais nada — **excepto em duas tabelas**:

```sql
-- ti_tickets e ti_ticket_sugestoes
(org_id = get_current_org_id()) OR is_decada_ousada_admin()
```

Verificado a 2026-08-28: são as **únicas duas** em toda a base. É uma decisão de
produto defensável — quem vende a plataforma tem de ler os pedidos de suporte de
quem a usa — mas tem de ser lida como aquilo que é: um admin da Década Ousada lê
a descrição em texto livre de qualquer ticket de qualquer cliente.

O buraco é estreito de propósito: `ti_tokens` e `ti_submissoes` **não** o têm.

Consequência lateral aceite: a numeração dos tickets passou a ser global à
plataforma (`ti_tickets_numero_unico` é `UNIQUE (numero)` sem `org_id`), o que
permite a uma organização inferir a cadência de tickets das outras a partir dos
saltos na sua própria numeração. É metadado, não conteúdo.

### 2.4 Gate de CI

`ci.yml` ganhou o job **`🗄️ DB Rebuild + pgTAP`**, que corre em todos os pushes
e pull requests. Sem `continue-on-error`, sem `workflow_dispatch`.

Faz, por esta ordem:

1. verifica que o baseline existe. **Se não existir, o job passa e declara-se
   inactivo** no resumo do PR, em vez de falhar. É deliberado: o workflow que
   gera o baseline só fica disponível depois de chegar a `main`, e um gate que
   falhasse aqui impediria o PR que traz esse mesmo workflow de entrar. É um
   estado de arranque com fim conhecido — uma execução do cutover resolve-o
   para sempre;
2. verifica que não há carimbos de versão duplicados;
3. `supabase db start` — reconstrói do zero;
4. pgTAP do motor de automação (10 ficheiros);
5. pgTAP das notificações (4 ficheiros);
6. pgTAP de segurança e multi-tenancy (2 ficheiros).

`rls-test.yml` deixou de conter a explicação de porque o gate não podia existir
e passou a ser uma ferramenta manual: corre os 41 ficheiros pgTAP e produz uma
tabela de quais passam, para se promoverem um a um.

---

## 3. Como reconstruir a base de dados

### 3.1 Uma vez: o cutover para baseline

Ainda **não foi feito**. **Não precisas de Docker** — corre num runner do
GitHub Actions, que já o tem.

**Passo 1.** *Settings → Secrets and variables → Actions → New repository secret*

```
Nome:  SUPABASE_DB_URL
Valor: postgresql://postgres:<password>@db.hkqzzxgeedsmjnhyquke.supabase.co:5432/postgres
```

A password está em *Supabase Dashboard → Project Settings → Database*. Fica só
no cofre de segredos do GitHub — nunca num ficheiro versionado.

**Passo 2.** *Actions → 🧱 Gerar baseline do schema → Run workflow*, escrevendo
`baseline` no campo de confirmação.

**Passo 3.** O workflow cria o ramo `chore/baseline-schema`. Abre PR e faz merge.

O que ele faz, por esta ordem:

1. gera `supabase/migrations/00000000000000_baseline.sql` com `supabase db dump`
   — a ferramenta oficial, não um dump montado à mão;
2. recusa-se a continuar se o dump for suspeito (menos de 500 linhas, ou sem
   nenhum `CREATE TABLE`);
3. só depois move os 800 ficheiros históricos para
   `supabase/migrations_archive/`;
4. reconstrói uma base do zero e corre o pgTAP do motor contra ela;
5. **só empurra o ramo se tudo isso passar.**

Nunca fica um estado intermédio sem migrações nenhumas, e nunca é empurrado um
baseline por verificar. Produção não é escrita — o dump é uma leitura.

**Alternativa local** (só se alguém tiver Docker): `scripts/baseline-cutover.sh`
faz o mesmo. Sem Docker o script escreve o baseline mas avisa que não o
verificou, e manda usar o workflow.

### 3.1.1 O que o baseline **não** contém

`supabase db dump --schema public` traz apenas o schema `public`. Fica de fora:

| O que fica de fora | Consequência | Tratamento |
|---|---|---|
| **Extensões** (`pg_net`, `pg_trgm`, `unaccent`, `btree_gist`, `pgcrypto`, `uuid-ossp`, `pg_cron`) | O `public` depende delas. Sem `pg_net` não existe `net._http_response` e a view `cron_edge_health` não se cria. | **Resolvido** — o script escreve `create extension if not exists …` no topo do baseline, antes do dump |
| **Trabalhos agendados** (schema `cron`, 37 jobs) | Uma base reconstruída tem a estrutura toda mas nenhum job a correr | **Aceite.** Para testes é o que se quer — crons a disparar num ambiente de teste seriam um problema, não uma funcionalidade. Para recuperação de desastre é um gap real: os jobs teriam de ser recriados a partir de `cron.job` de produção |
| **Schemas `auth`, `storage`, `realtime`, `vault`** | — | Criados pelo próprio stack local do Supabase |
| **Dados** | O baseline é só estrutura | Por desenho. Não é backup nem o substitui |

#### A primeira execução real (2026-08-28)

Falhou, e vale a pena o registo porque é exactamente para isto que a verificação
existe:

```
Applying migration 00000000000000_baseline.sql...
ERROR: relation "net._http_response" does not exist (SQLSTATE 42P01)
At statement: 1060
CREATE OR REPLACE VIEW "public"."cron_edge_health" …
  LEFT JOIN "net"."_http_response" "r" …
```

O dump estava correcto (33 065 linhas). O que faltava era o pressuposto: a view
depende de uma extensão que o dump não traz. **Nada foi empurrado** — o passo de
verificação corre antes do `git push` precisamente para que um baseline que não
reconstrói nunca chegue ao repositório.

### 3.2 Daí em diante

```bash
supabase db reset    # baseline + migrações posteriores
supabase test db     # pgTAP
```

---

## 4. Como correr os testes

| Alvo | Comando | Onde corre |
|---|---|---|
| Unitários (app) | `pnpm test` | Local e CI |
| Tipos | `pnpm type-check` | Local e CI |
| Lint | `pnpm lint` | Local e CI |
| Build | `pnpm build` | Local e CI |
| Edge functions | `deno test --allow-read supabase/functions/_shared` | Local e CI |
| **Base de dados (gate)** | `bash scripts/pgtap-suite.sh "<nome>" <teste>...` | CI, job `db-tests` |
| **pgTAP completo** | workflow `🛡️ pgTAP completo`, a pedido | CI manual |

`scripts/pgtap-suite.sh` corre os ficheiros **um a um**, em vez de os passar todos
a `supabase test db` de uma vez. A diferença importa: assim sabe-se o estado de
cada ficheiro mesmo depois de um falhar, e um ficheiro renomeado sem actualizar a
lista falha em vez de ser saltado em silêncio. O resumo aparece no separador
*Summary* do GitHub Actions.

Para correr um conjunto localmente (precisa de Docker e de `supabase db start`):

```bash
bash scripts/pgtap-suite.sh "Motor" process_domain_events execute_automation_runs
```

Os testes de base de dados exigem Docker. Sem Docker não correm de todo — não
há modo degradado.

### 4.0 O estado em que os testes estavam (2026-08-28)

Quando os pgTAP finalmente correram pela primeira vez, **os 10 do motor
falharam todos**. Nenhuma das falhas era um bug do motor — eram os testes que
tinham apodrecido por nunca terem sido executados. Três causas:

| Causa | Alcance | O que era |
|---|---|---|
| **UUIDs não hexadecimais** | 136 distintas, 417 ocorrências, 22 ficheiros | Os testes usavam mnemónicas legíveis — `…000000rg0001` para «regra 1», `ru` para run, `cg` para cargo. `g`, `r`, `u` não existem em hexadecimal, por isso o ficheiro nem chegava a fazer parse: `invalid input syntax for type uuid` |
| **`organizacoes.codigo` NOT NULL** | 3 ficheiros | Os testes inseriam organizações só com `id` e `nome`. A coluna passou a obrigatória depois de os testes serem escritos |
| **`plan()` desactualizado** | 4 ficheiros | `plan(10)` num ficheiro com 7 asserções. O pgTAP falha com «Bad plan» mesmo que todas passem |

Isto confirma, de forma que não deixa dúvidas, o diagnóstico da auditoria: os
39 ficheiros pgTAP **existiam e nunca tinham corrido**. O
`execute_automation_runs.test.sql`, apontado na auditoria como o teste que
teria apanhado o erro `v_run`/`v_rule`, não conseguia sequer ser lido pelo
Postgres.

#### Como foram corrigidos

As UUIDs foram convertidas por um mapeamento determinístico dos caracteres
não-hex (`g→6`, `r→4`, `u→c`, …), com verificação automática de colisões — duas
UUIDs distintas nunca podem passar a ser a mesma, e o script aborta se isso
acontecesse. Aconteceu à primeira tentativa (`h→b` chocava com uma UUID já
válida) e o mapeamento foi ajustado.

O `seed_automacao_defaults.test.sql` foi **reescrito**, e não só corrigido. Ele
afirmava que a função criava exactamente 5 regras; hoje cria 19 — não por bug,
mas porque o motor ganhou 14 tipos de evento (produção confirma 19 regras com
19 códigos distintos nas 5 organizações). Passou a verificar invariantes que
não apodrecem — «não duplica», «o trigger semeia o mesmo que a chamada
directa», «não há códigos repetidos», «nenhuma nasce desactivada» — em vez de
números mágicos. A contagem exacta ficou num único sítio, com o motivo escrito
ao lado.

#### O que as rondas seguintes revelaram

Ressuscitar os testes descascou o sistema por camadas — primeiro o *parse*,
depois as *constraints*, depois os *triggers*, e por fim o *comportamento*.
Três achados que não eram podridão de teste e ficam registados:

**1. Não se insere uma viatura dando `marca` como texto.** O trigger
`trg_sync_viatura_marca_modelo` faz, sem condição nenhuma no INSERT,
`select nome into NEW.marca from viatura_marcas where id = NEW.marca_id`. Sem
`marca_id`, o `SELECT` não encontra linha, o `INTO` põe NULL, e o valor que o
chamador deu é deitado fora antes de chegar à tabela — que o recusa por ser
NOT NULL. Qualquer caminho de código que insira viaturas tem de passar por
`marca_id`/`modelo_id`.

**2. Uma execução presa é RE-AGENDADA, não morta.** O sweep de
`automation_runs_claim` marcava `failed` directamente; a migração
`20260729100000` passou-o a chamar `automation_runs_fail()` para que a falha
aparecesse nos logs e na dead-letter. Efeito colateral: essa função só marca
`failed` quando as tentativas se esgotam, pelo que um run preso volta a
`pending` com backoff. É melhor para falhas transitórias e **pior para efeitos
já produzidos** — um run que criou notificações e morreu antes de concluir
volta a criá-las. É o cenário C da auditoria, agora confirmado por teste.

**3. `automacao_execucao_manual_lock` é invisível a `authenticated`.** Tem RLS
ligada e apenas uma policy RESTRICTIVE de negação — nenhuma permissiva. É o
desenho certo (só a função SECURITY DEFINER lhe escreve), mas significa que
qualquer leitura feita com o papel da aplicação devolve vazio, não erro.

#### O que ainda não se sabe

Corrigidas estas três causas, os testes **passam a correr**. Se passam é outra
questão: nunca foram executados, portanto as asserções podem revelar mais
podridão de teste — ou bugs reais do motor. As duas hipóteses são úteis e
distinguem-se caso a caso.

### 4.1 Ficheiros pgTAP ainda por promover ao gate

Existem 41 ficheiros em `supabase/tests/`. O gate corre 16. Os restantes 25 não
estão excluídos por decisão de qualidade — estão por verificar. Promovem-se um a
um: correr o workflow manual, escolher um que falhe, perceber porquê, arranjar,
acrescentar à lista em `ci.yml`.

---

## 5. Divergências conhecidas

| # | Divergência | Estado |
|---|---|---|
| D-1 | O cutover para baseline **ainda não foi executado**. Até lá o job `db-tests` passa mas anuncia-se **inactivo** no resumo do PR, e nenhum teste de base de dados corre. | **Aberto** — falta o segredo `SUPABASE_DB_URL` e uma execução do workflow `🧱 Gerar baseline do schema` |
| D-2 | O texto original das duas migrações `ti_tickets_*` não existe. Os ficheiros no repositório são reconstruções fiéis no efeito, não no texto. | Aceite e documentado |
| D-3 | O commit `941a6746` traz também `supabase/functions/apify-credenciais-partilhadas/` e alterações a `IntegracaoDialog.tsx` e `integracoes/types.ts` que continuam por integrar. Só a migração foi recuperada. | **Aberto** — decisão fora do âmbito da Fase 0 |
| D-4 | 59 carimbos duplicados continuam nos ficheiros históricos. Deixam de importar assim que forem arquivados, mas até lá bloqueiam o reset. | Resolve-se com D-1 |
| D-5 | `apify_credenciais_partilhadas` não tem seed: os tokens reais foram inseridos directamente na base e não estão no git. Um ambiente novo precisa de os inserir à mão. | Por desenho — são segredos |
| D-6 | O ramo `feat/automacoes-canvas-fluxo` está 26 commits à frente de `main` e nunca foi integrado. Outros três ramos locais estão 10–23 commits à frente. | **Aberto** |
| D-7 | `20260827151938_ti_tickets_numero_global` foi aplicada a produção **durante** este trabalho e não existe em nenhum objecto git. É a mesma classe de problema que a Fase 0 veio resolver, a acontecer outra vez. | **Aberto** — recuperar o ficheiro ou documentar o conteúdo |
| D-8 | O baseline não traz os privilégios: `pg_dump --schema public` emite os GRANTs existentes mas **não** o `ALTER DEFAULT PRIVILEGES` nem os `REVOKE`. Uma base reconstruída nasce com `anon` a poder tudo (194 relações legíveis, 564 com escrita, 208 funções `SECURITY DEFINER` executáveis), enquanto produção está limpa (0/2/24). | **Aberto** — falta um ficheiro de arranque que reponha `20260730084227` camada 1 |

### 5.1 Achado de segurança em produção (corrigido a 2026-08-28)

O teste `rls_org_isolation.test.sql`, ao correr em CI pela primeira vez,
encontrou **31 tabelas com coluna `org_id` sem a política `rls_org_isolation`**.
Não era artefacto do rebuild: produção tinha-as na mesma. Nasceram depois da
migração de hardening `20260730084227`, que criou as políticas num bloco `DO` e
nunca mais foi re-executada.

Na maioria não havia fuga — a política permissiva já filtrava por organização.
Em **três** não filtrava em lado nenhum:

| Tabela | Política permissiva de SELECT | Efeito |
|---|---|---|
| `cartao_atribuicoes` | `is_current_user_admin() OR has_permission(…,'administrativo_cartoes')` | Quem tivesse a permissão na org A lia as atribuições de cartão de **todas** as organizações |
| `motorista_plataforma_identidades` | `is_current_user_admin() OR has_permission(…,'motoristas')` | Idem, para o mapeamento motorista ↔ plataforma |
| `refecho_pendente` | `is_current_user_admin() OR can_view_financeiro()` | Idem, para refechos financeiros pendentes |

O padrão é o mesmo nas três: a permissiva verifica **quem é o utilizador** e
nunca **de quem é a linha**.

Corrigido por `20260828084250`, que aplicou `rls_org_isolation` a 27 tabelas.
Verificado antes de aplicar: **0 linhas com `org_id` NULL** em todas elas — uma
política `org_id = get_current_org_id()` esconderia linhas com NULL em silêncio.

Três exclusões deliberadas:

- **`user_organizacoes` e `user_org_ativa`** — são o arranque do inquilino. O
  `TenantContext` lê-as directamente para listar as organizações do utilizador
  e saber qual está activa. Filtrá-las pela organização activa é circular, e o
  selector de organizações passaria a mostrar uma só.
- **`profiles`** — 34 call sites, incluindo registo e conta pessoal, onde o
  utilizador pode ainda não ter organização. Merece migração própria.

---

## 6. Regras para migrações novas

1. **Um carimbo, um ficheiro.** O gate verifica-o e falha se for violado.
2. **Nunca escrever contra o estado de produção.** Se a migração assume que uma
   coluna já existe, ou cria-a, ou envolve-se num guarda de existência — como o
   de `20250811122918`.
3. **Não editar migrações históricas** já aplicadas. A excepção de 2026-08-28
   (o `v_run`/`v_rule`) justificou-se por produção nunca ter tido a versão do
   ficheiro; é o único caso em que faz sentido.
4. **Alterações de comportamento trazem teste pgTAP** e o ficheiro entra na
   lista do job `db-tests`.
5. **Tabelas novas** levam `org_id NOT NULL`, política RESTRICTIVE
   `rls_org_isolation`, política RESTRICTIVE `rls_deny_anon`, e política
   permissiva de permissão. Os testes `rls_org_isolation.test.sql` e
   `rls_anon_exposure.test.sql` falham automaticamente se faltar.

---

## 7. O que esta fase **não** fez

A Fase 0 é reconciliação. O motor em si continua com os problemas que a
auditoria identificou, e nenhum foi tocado:

- `process_domain_events` continua **sem locking** (`FOR UPDATE SKIP LOCKED`) e
  sem tratamento de erro — um evento envenenado ainda pode bloquear o lote.
- As condições continuam a **passar sempre** com um operador desconhecido, e
  `!=` sobre um campo inexistente continua a disparar a regra.
- As execuções continuam **sem snapshot da regra**: editar ou desactivar uma
  automação altera execuções já em fila.
- `retry_failed_job` continua a repor `attempt = 0` **sem guarda de efeito**.
- `executar_jobs_automacao_manualmente` continua a actuar sobre **todas as
  organizações**.
- Tipos de acção não implementados (`webhook`, `automacao_interna`) continuam a
  **concluir como sucesso** sem fazer nada.

Isto foi deliberado: sem base reconstruível não há testes, e sem testes
qualquer correcção a estas funções é uma aposta. A sequência acordada é
**Fase 0 → CI verde → Fases 1+**.

O detalhe de cada um destes pontos, com evidência e severidade, está no
relatório de auditoria de 2026-08-27.
