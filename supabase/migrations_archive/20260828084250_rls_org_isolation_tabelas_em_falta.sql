-- ============================================================================
-- Isolamento por organização nas tabelas que ficaram para trás
-- ============================================================================
--
-- ── COMO ISTO FOI ENCONTRADO ────────────────────────────────────────────────
--
-- A 2026-08-28, ao pôr os pgTAP a correr em CI pela primeira vez, o teste
-- `rls_org_isolation.test.sql` falhou: 27 tabelas com coluna `org_id` sem a
-- política `rls_org_isolation`. Verificado contra produção: são 31.
--
-- Não era artefacto do rebuild. Estas tabelas nasceram depois da migração de
-- hardening `20260730084227`, que criou as políticas em bloco e nunca mais foi
-- re-executada.
--
-- ── O QUE ESTAVA MESMO EXPOSTO ──────────────────────────────────────────────
--
-- Ter `org_id` sem `rls_org_isolation` não é, por si, uma fuga: a maioria
-- destas tabelas já filtrava por organização dentro da própria política
-- permissiva (`danos_tokens`, `documento_assinatura_pedidos`, `email_caixas`,
-- `email_comandos`, `relatorio_pagamento_pagos` — todas com
-- `org_id = get_current_org_id()` no USING).
--
-- Três não filtravam por organização em lado nenhum:
--
--   · cartao_atribuicoes              is_current_user_admin() OR has_permission('administrativo_cartoes')
--   · motorista_plataforma_identidades is_current_user_admin() OR has_permission('motoristas')
--   · refecho_pendente                is_current_user_admin() OR can_view_financeiro()
--
-- Em todas, a permissiva verifica QUEM é o utilizador e nunca DE QUEM é a
-- linha. Um utilizador com `administrativo_cartoes` na organização A lia as
-- atribuições de cartão de todas as organizações. É leitura entre inquilinos,
-- do tipo que o produto trata como invariante inviolável.
--
-- ── PORQUE UMA POLÍTICA RESTRICTIVE, E NÃO CORRIGIR CADA PERMISSIVA ─────────
--
-- Mesmo raciocínio de 20260730084227: é aditivo. Não reescreve políticas que
-- estão correctas, aplica-se a TODOS os comandos de uma vez, e o rollback é
-- apagar o que foi acrescentado. Uma RESTRICTIVE compõe-se com E lógico, por
-- isso as permissivas existentes continuam a mandar em tudo o resto.
--
-- ── AS TRÊS EXCLUSÕES, E PORQUÊ ─────────────────────────────────────────────
--
-- `user_organizacoes` e `user_org_ativa` são o ARRANQUE do inquilino. O
-- TenantContext lê-as directamente para listar as organizações do utilizador e
-- descobrir qual está activa. Uma política `org_id = get_current_org_id()`
-- nelas seria circular: para saber a organização activa é preciso ler a tabela
-- que a política filtra pela organização activa. Na prática, o selector de
-- organizações passaria a mostrar uma só — e a troca de organização morria.
-- As funções auxiliares não sofrem (são SECURITY DEFINER), mas o browser sim.
--
-- `profiles` fica de fora por precaução, não por estar correcta. É lida em 34
-- ficheiros, incluindo `Register.tsx` e `MyAccount.tsx`, onde o utilizador pode
-- ainda não ter organização. Merece migração própria, com o fluxo de registo
-- verificado a sério.
--
-- `_backup_viaturas_20260710*` são tabelas de cópia de uma migração de Julho.
-- Não se protege lixo — apaga-se. Ficam assinaladas para remoção em vez de
-- ganharem políticas que sugerem que são para ficar.
-- ============================================================================

do $$
declare
  r record;
  -- Excluídas com justificação no cabeçalho. Acrescentar aqui exige a mesma
  -- justificação: qual é o fluxo que se parte se a política for aplicada.
  excluidas text[] := array[
    'user_organizacoes',
    'user_org_ativa',
    'profiles'
  ];
  criadas int := 0;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind in ('r', 'p')
      and c.relname <> all (excluidas)
      and c.relname not like '\_backup\_%'
      and exists (
        select 1 from information_schema.columns col
        where col.table_schema = 'public'
          and col.table_name = c.relname
          and col.column_name = 'org_id'
      )
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = c.relname
          and p.policyname = 'rls_org_isolation'
      )
    order by c.relname
  loop
    execute format(
      'create policy rls_org_isolation on public.%I '
      'as restrictive for all to authenticated '
      'using (org_id = public.get_current_org_id()) '
      'with check (org_id = public.get_current_org_id())',
      r.relname
    );
    criadas := criadas + 1;
    raise notice 'rls_org_isolation criada em %', r.relname;
  end loop;
  raise notice 'total: rls_org_isolation criada em % tabelas', criadas;
end $$;

-- ── Camada 2 do mesmo hardening: negar `anon` explicitamente ────────────────
-- O teste `rls_anon_exposure` apanhou 10 tabelas sem `rls_deny_anon`, pela
-- mesma razão: nasceram depois de 20260730084227. Hoje `anon` não tem grant
-- nenhum em `public` (verificado: 0 tabelas com SELECT), portanto isto é
-- defesa em profundidade e não o tampão de um buraco aberto — mas é
-- exactamente o que essa migração dizia que a asserção de CI havia de apanhar.
do $$
declare
  r record;
  allowlist text[] := array['organizacoes', 'leads_dasprent', 'login_attempts'];
  criadas int := 0;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind in ('r', 'p')
      and c.relname <> all (allowlist)
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = c.relname
          and p.policyname = 'rls_deny_anon'
      )
    order by c.relname
  loop
    execute format(
      'create policy rls_deny_anon on public.%I '
      'as restrictive for all to anon using (false) with check (false)',
      r.relname
    );
    criadas := criadas + 1;
  end loop;
  raise notice 'total: rls_deny_anon criada em % tabelas', criadas;
end $$;
