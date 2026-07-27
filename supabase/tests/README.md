# Testes de base de dados (pgTAP)

Testes que correm **dentro do Postgres** — para invariantes que os testes
de unidade do frontend (Vitest, com o cliente Supabase mockado) não conseguem
verificar: RLS, constraints, triggers e funções SQL.

## Porquê

O frontend é hostil; a segurança real vive no Supabase via RLS
(ver [AGENTS.md](../../AGENTS.md) §11). Um typo numa policy pode abrir um
data leak entre organizações sem que nada no TypeScript se aperceba. Estes
testes provam o isolamento contra o schema real.

## Como correr

### Com Docker (suite completa)

```sh
supabase start        # sobe Postgres local + aplica migrations
supabase test db      # corre todos os supabase/tests/*.test.sql (pgTAP)
```

`supabase test db` carrega a extensão `pgtap` automaticamente, corre cada
ficheiro numa transação e faz rollback no fim — não deixa lixo na BD local.

### Sem Docker (auditoria read-only, em produção)

Cola [`rls_org_audit.sql`](rls_org_audit.sql) no **SQL editor do Supabase**.
É só leitura de catálogo (não escreve nada) e devolve **0 linhas** se o
isolamento estiver íntegro; qualquer linha é uma tabela a corrigir. Cobre a
parte META (a de maior valor) contra o schema real de produção. Correr
sempre que se cria uma tabela nova com `org_id`.

## Ficheiros

| Ficheiro | Cobre |
| -------- | ----- |
| `rls_org_isolation.test.sql` | Isolamento multi-tenant: (META) toda a tabela com `org_id` tem RLS + a policy RESTRICTIVE `rls_org_isolation`; (COMPORTAMENTO) com 2 orgs/2 users, cada user só vê a sua org e o `WITH CHECK` bloqueia escrita cross-org. |
| `automation_rules.test.sql` | Motor de Automação: isolamento comportamental de `domain_events`/`automation_rules` por org, e que a policy de permissão (`has_permission`/`is_current_user_admin`) bloqueia quem não tem o recurso `automacoes`. |
| `automation_queue.test.sql` | Motor de Automação: `automation_runs_claim()`/`_complete()`/`_fail()` — claim atómico, um run ativo por regra+org, retry com backoff exponencial, dead-letter em `failed_jobs` ao esgotar tentativas, sweep de runs presos em `running`, e que `automation_logs` regista cada execução/falha. |
| `emit_expiry_events.test.sql` | Motor de Automação: `emit_expiry_events()` — deteta viaturas/motoristas a entrar na janela de 15 dias (seguro, IPO, carta, licença TVDE), exclui vendidas/inativas, e não duplica um evento ainda não processado. |
| `process_domain_events.test.sql` | Motor de Automação: Rule Engine — casa eventos com regras ativas por org+tipo, avalia condições (`=`/`!=`), respeita cooldown por regra+entidade, cria `automation_runs` (ou regista `condicao_nao_satisfeita`/`ignorada_cooldown`), e marca sempre o evento como processado, mesmo quando colide com um run já ativo. |
| `notifications.test.sql` | Motor de Automação: `notifications` — só o destinatário (ou um admin da própria org) vê/atualiza uma notificação, isolamento entre orgs, e configuração de Realtime (REPLICA IDENTITY FULL + publicação supabase_realtime). |
| `notification_queue.test.sql` | Motor de Automação: `notification_queue_claim()`/`_complete()`/`_fail()` — claim atómico por canal, retry com backoff, dead-letter em `failed_jobs` (partilhado com `automation_runs`) ao esgotar tentativas. |

## Convenção

- Um ficheiro por área (`<area>.test.sql`).
- Estrutura: `begin; select plan(N); … select * from finish(); rollback;`.
- Seed sempre dentro da transação (rollback limpa tudo).
- O teste META de RLS deve ser revisto sempre que se cria uma tabela nova
  com `org_id` — se faltar a policy, este teste falha (é o objetivo).
