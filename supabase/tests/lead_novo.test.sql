-- ============================================================
-- "Lead novo": domain event + sino + email aos gestores TVDE (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Um INSERT em leads_dasprent publica lead.novo e a cadeia chega a quem tem
-- o cargo "Gestor TVDE": linha em `notificacoes` (sino) pela regra
-- 'notificacao' e linha em `notification_queue` pela gémea 'email'.
-- Organização sem esse cargo: a regra cai no Administrador.
-- Ver a migração 20261020120000.
-- ============================================================

begin;
select plan(17);

-- O webhook externo não tem nada a ver com este teste.
alter table public.leads_dasprent disable trigger "Lead Distância";

select ok(exists (select 1 from public.notificacao_tipos where tipo = 'lead_novo'), 'tipo existe');
select is((select tipo_legado from public.notificacao_tipo_map where event_type = 'lead.novo'),
  'lead_novo', 'evento mapeado para o tipo');
select ok(public.automation_catalogo()->'eventos' ? 'lead.novo', 'o editor conhece o evento');

-- Bootstrap: consome a vaga de "primeiro utilizador da instalação" antes de
-- existir organização (ver semana_plataforma_em_falta.test.sql).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000002000ff', 'bootstrap@lead-novo.pt');

-- ── Organização nova: ensure_base_cargos cria "Gestor TVDE" antes da seed ──

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000200000', 'Org Lead Novo', 'lead-novo');

select is(
  (select count(*)::int from public.automation_rules
    where org_id = '00000000-0000-0000-0000-000000200000'
      and event_type = 'lead.novo' and acao_tipo in ('notificacao', 'email') and ativo),
  2,
  'a organização nova recebe as regras gémeas notificacao+email'
);

select is(
  (select count(distinct grupo_id)::int from public.automation_rules
    where org_id = '00000000-0000-0000-0000-000000200000' and event_type = 'lead.novo'),
  1,
  'as duas regras partilham o grupo_id'
);

select is(
  (select count(*)::int from public.automation_rules r
    where r.org_id = '00000000-0000-0000-0000-000000200000'
      and r.event_type = 'lead.novo'
      and r.acao_config->'destinatarios_cargo_ids' = (
        select jsonb_build_array(c.id) from public.cargos c
         where c.org_id = r.org_id and c.nome = 'Gestor TVDE')),
  2,
  'as duas regras apontam só ao cargo Gestor TVDE'
);

select ok(
  (select assunto || corpo_template from public.notification_templates
    where org_id = '00000000-0000-0000-0000-000000200000'
      and codigo = 'lead.novo' and canal = 'email' and ativo)
  !~ '[—–]',
  'o modelo de email não tem travessões'
);

select lives_ok($$ select public.seed_alerta_lead_novo('00000000-0000-0000-0000-000000200000') $$,
  'seed corre outra vez sem erro');
select is(
  (select count(*)::int from public.automation_rules
    where org_id = '00000000-0000-0000-0000-000000200000' and event_type = 'lead.novo'),
  2,
  'seed repetido não duplica'
);

-- ── Um lead entra ───────────────────────────────────────────────────────

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000200a01', 'gestor@lead-novo.pt'),
  ('00000000-0000-0000-0000-000000200a02', 'supervisor@lead-novo.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id)
select '00000000-0000-0000-0000-000000200a01', c.org_id, false, c.id
  from public.cargos c
 where c.org_id = '00000000-0000-0000-0000-000000200000' and c.nome = 'Gestor TVDE';

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id)
select '00000000-0000-0000-0000-000000200a02', c.org_id, false, c.id
  from public.cargos c
 where c.org_id = '00000000-0000-0000-0000-000000200000' and c.nome = 'Supervisor Gestor TVDE';

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-000000200a01', '00000000-0000-0000-0000-000000200000'),
  ('00000000-0000-0000-0000-000000200a02', '00000000-0000-0000-0000-000000200000');

insert into public.leads_dasprent (id, org_id, nome, email, telefone, zona) values
  ('00000000-0000-0000-0000-000000200001', '00000000-0000-0000-0000-000000200000',
   'Ana Lead', 'ana@lead.pt', '912345678', 'Lisboa');

select is(
  (select payload->>'mensagem' from public.domain_events
    where event_type = 'lead.novo' and entity_id = '00000000-0000-0000-0000-000000200001'),
  'Lead novo: Ana Lead (ana@lead.pt, 912345678). Zona: Lisboa.',
  'o INSERT publica um evento com a mensagem do lead'
);

select public.process_domain_events();
select public.execute_automation_runs();

select is(
  (select array_agg(distinct destinatario_id) from public.notificacoes
    where org_id = '00000000-0000-0000-0000-000000200000' and tipo = 'lead_novo'),
  array['00000000-0000-0000-0000-000000200a01'::uuid],
  'só o Gestor TVDE recebe no sino'
);

select is(
  (select link from public.notificacoes
    where tipo = 'lead_novo' and destinatario_id = '00000000-0000-0000-0000-000000200a01'),
  '/crm/lead/00000000-0000-0000-0000-000000200001',
  'o aviso abre o lead no CRM'
);

select is(
  (select array_agg(destinatario order by destinatario) from public.notification_queue
    where org_id = '00000000-0000-0000-0000-000000200000'
      and canal = 'email' and template_codigo = 'lead.novo'),
  array['gestor@lead-novo.pt'],
  'a regra gémea de email põe o aviso na fila só para o Gestor TVDE'
);

-- ── Sem cargo Gestor TVDE: cai no Administrador ────────────────────────
-- Nome em maiúsculas primeiro (a Premium Ride tem "GESTOR TVDE"), depois
-- sem cargo nenhum com esse nome.

update public.cargos set nome = 'GESTOR TVDE'
 where org_id = '00000000-0000-0000-0000-000000200000' and nome = 'Gestor TVDE';
delete from public.automation_rules
 where org_id = '00000000-0000-0000-0000-000000200000' and event_type = 'lead.novo';
select public.seed_alerta_lead_novo('00000000-0000-0000-0000-000000200000');

select is(
  (select count(*)::int from public.automation_rules r
    where r.org_id = '00000000-0000-0000-0000-000000200000'
      and r.event_type = 'lead.novo'
      and r.acao_config->'destinatarios_cargo_ids' = (
        select jsonb_build_array(c.id) from public.cargos c
         where c.org_id = r.org_id and c.nome = 'GESTOR TVDE')),
  2,
  'o cargo é encontrado sem distinguir maiúsculas'
);

update public.cargos set nome = 'Comercial'
 where org_id = '00000000-0000-0000-0000-000000200000' and nome = 'GESTOR TVDE';
delete from public.automation_rules
 where org_id = '00000000-0000-0000-0000-000000200000' and event_type = 'lead.novo';
select public.seed_alerta_lead_novo('00000000-0000-0000-0000-000000200000');

select is(
  (select count(*)::int from public.automation_rules r
    where r.org_id = '00000000-0000-0000-0000-000000200000'
      and r.event_type = 'lead.novo'
      and r.acao_config->'destinatarios_cargo_ids' = (
        select jsonb_build_array(c.id) from public.cargos c
         where c.org_id = r.org_id and c.nome = 'Administrador')),
  2,
  'sem cargo Gestor TVDE, as regras apontam ao Administrador'
);

-- ── Um lead nunca se perde por causa do aviso ──────────────────────────
-- Força a falha do evento: sem a FK de leads, o lead aceita um org_id que
-- não existe, e a FK de domain_events recusa-o.
alter table public.leads_dasprent drop constraint leads_dasprent_org_id_fkey;

select lives_ok(
  $$ insert into public.leads_dasprent (id, org_id, nome, email) values
       ('00000000-0000-0000-0000-000000200002', '00000000-0000-0000-0000-0000002fffff',
        'Lead Sem Org', 'sem@org.pt') $$,
  'uma falha a publicar o evento não bloqueia o INSERT do lead'
);

select ok(
  exists (select 1 from public.leads_dasprent where id = '00000000-0000-0000-0000-000000200002'),
  'o lead ficou gravado'
);

select * from finish();
rollback;
