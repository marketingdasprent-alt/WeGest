-- ============================================================
-- Emails externos de notificação (Definições > Notificações): pgTAP
-- ============================================================
-- Corre com:  supabase db start  &&  supabase test db
--
-- Ver a migração 20261007100000. Provas:
--   (1) um email activo e subscrito ao evento recebe a notificação e o email,
--       pela regra de email do evento; inactivo, apagado ou subscrito a outro
--       evento não recebe nada;
--   (2) numa regra com resumo diário o externo fica só com a linha-mãe e o
--       email sai no resumo das 9h, agrupado por endereço;
--   (3) um evento que só tem regra de sino não manda email ao externo;
--   (4) a lista é por organização: outra org não a vê, o anónimo não lhe toca;
--   (5) endereço mal formado é recusado e o mesmo endereço não entra duas vezes;
--   (6) o seed deixa de criar regras sem destinatário;
--   (7) só o dono da base chama a função de subscritos.
-- ============================================================

begin;
select plan(19);

-- Consome a vaga de "primeiro utilizador da instalação".
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000008e00ff', 'bootstrap@emails-externos.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000008e0000', 'Org Emails Externos', 'emails-ext-a'),
  ('00000000-0000-0000-0000-0000008e0b00', 'Org Vizinha', 'emails-ext-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000008e0001', 'admin@emails-ext-a.pt'),
  ('00000000-0000-0000-0000-0000008e0b01', 'admin@emails-ext-b.pt');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000008e0001', '00000000-0000-0000-0000-0000008e0000'),
  ('00000000-0000-0000-0000-0000008e0b01', '00000000-0000-0000-0000-0000008e0b00')
on conflict (user_id) do update set org_id = excluded.org_id;

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-0000008e0001', '00000000-0000-0000-0000-0000008e0000', true, null),
  ('00000000-0000-0000-0000-0000008e0b01', '00000000-0000-0000-0000-0000008e0b00', true, null)
on conflict (user_id, org_id) do update set is_admin = excluded.is_admin;

-- Regras do evento: email imediato, email em resumo diário, e uma só de sino.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-00000e8e0001', '00000000-0000-0000-0000-0000008e0000', 'zz.teste.seguro.email', 'Seguro (email)',
   'viatura.seguro_expirando', 'email',
   jsonb_build_object('template_codigo', 'teste.seguro', 'titulo', 'Seguro a expirar',
                      'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', jsonb_build_array())),
  ('00000000-0000-0000-0000-00000e8e0002', '00000000-0000-0000-0000-0000008e0000', 'zz.teste.inspecao.email', 'IPO (email, resumo)',
   'viatura.inspecao_expirando', 'email',
   jsonb_build_object('template_codigo', 'teste.inspecao', 'titulo', 'IPO a expirar',
                      'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', jsonb_build_array(),
                      'enviar_email_digest', true)),
  ('00000000-0000-0000-0000-00000e8e0003', '00000000-0000-0000-0000-0000008e0000', 'zz.teste.cobranca.sino', 'Cobrança (sino)',
   'cobranca.gerada', 'notificacao',
   jsonb_build_object('template_codigo', 'teste.cobranca', 'titulo', 'Cobrança gerada',
                      'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', jsonb_build_array(),
                      'enviar_email', true));

-- Emails da organização: A activo, B inactivo, C apagado, D noutro evento.
insert into public.notificacao_emails_externos (id, org_id, email, nome, ativo, deleted_at) values
  ('00000000-0000-0000-0000-0000e5e00001', '00000000-0000-0000-0000-0000008e0000', 'A@Fora.PT', 'Contabilidade', true, null),
  ('00000000-0000-0000-0000-0000e5e00002', '00000000-0000-0000-0000-0000008e0000', 'b@fora.pt', 'Inactivo', false, null),
  ('00000000-0000-0000-0000-0000e5e00003', '00000000-0000-0000-0000-0000008e0000', 'c@fora.pt', 'Apagado', true, now()),
  ('00000000-0000-0000-0000-0000e5e00004', '00000000-0000-0000-0000-0000008e0000', 'd@fora.pt', 'Outro evento', true, null),
  ('00000000-0000-0000-0000-0000e5e00b01', '00000000-0000-0000-0000-0000008e0b00', 'vizinha@fora.pt', 'Da org B', true, null);

insert into public.notificacao_emails_externos_tipos (email_id, org_id, event_type) values
  ('00000000-0000-0000-0000-0000e5e00001', '00000000-0000-0000-0000-0000008e0000', 'viatura.seguro_expirando'),
  ('00000000-0000-0000-0000-0000e5e00001', '00000000-0000-0000-0000-0000008e0000', 'viatura.inspecao_expirando'),
  ('00000000-0000-0000-0000-0000e5e00001', '00000000-0000-0000-0000-0000008e0000', 'cobranca.gerada'),
  ('00000000-0000-0000-0000-0000e5e00002', '00000000-0000-0000-0000-0000008e0000', 'viatura.seguro_expirando'),
  ('00000000-0000-0000-0000-0000e5e00003', '00000000-0000-0000-0000-0000008e0000', 'viatura.seguro_expirando'),
  ('00000000-0000-0000-0000-0000e5e00004', '00000000-0000-0000-0000-0000008e0000', 'motorista.carta_expirando'),
  ('00000000-0000-0000-0000-0000e5e00b01', '00000000-0000-0000-0000-0000008e0b00', 'viatura.seguro_expirando');

select is(
  public.emails_externos_subscritos('00000000-0000-0000-0000-0000008e0000', 'viatura.seguro_expirando'),
  array['a@fora.pt']::text[],
  'subscritos ao seguro: só o A, em minúsculas (B inactivo, C apagado, D noutro evento, org B fora)'
);

-- ── (1) e (2) e (3): a execução ────────────────────────────

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-0000e4e00001', '00000000-0000-0000-0000-00000e8e0001', '00000000-0000-0000-0000-0000008e0000', 'viaturas', '00000000-0000-0000-0000-0000ef8e0001'),
  ('00000000-0000-0000-0000-0000e4e00002', '00000000-0000-0000-0000-00000e8e0002', '00000000-0000-0000-0000-0000008e0000', 'viaturas', '00000000-0000-0000-0000-0000ef8e0001'),
  ('00000000-0000-0000-0000-0000e4e00003', '00000000-0000-0000-0000-00000e8e0003', '00000000-0000-0000-0000-0000008e0000', 'contrato_cobrancas', '00000000-0000-0000-0000-0000ef8e0002');

select public.execute_automation_runs();

select is(
  (select status from public.automation_runs where id = '00000000-0000-0000-0000-0000e4e00001'),
  'completed',
  'o run da regra de email conclui'
);

select is(
  (select count(*)::int from public.notifications
    where rule_run_id = '00000000-0000-0000-0000-0000e4e00001' and destinatario_email_externo = 'a@fora.pt'),
  1,
  'o A recebe a notificação do seguro'
);

select is(
  (select count(*)::int from public.notification_queue
    where destinatario = 'a@fora.pt' and template_codigo = 'teste.seguro'),
  1,
  'e o email sai de imediato'
);

select is(
  (select count(*)::int from public.notifications
    where destinatario_email_externo in ('b@fora.pt', 'c@fora.pt', 'd@fora.pt', 'vizinha@fora.pt')),
  0,
  'inactivo, apagado, noutro evento e de outra org não recebem nada'
);

select is(
  (select count(*)::int from public.notifications
    where rule_run_id = '00000000-0000-0000-0000-0000e4e00002' and destinatario_email_externo = 'a@fora.pt'),
  1,
  'na regra em resumo diário o A fica com a linha-mãe'
);

select is(
  (select count(*)::int from public.notification_queue
    where destinatario = 'a@fora.pt' and template_codigo = 'teste.inspecao'),
  0,
  'mas sem email imediato'
);

select is(
  (select count(*)::int from public.notification_queue
    where destinatario = 'a@fora.pt' and template_codigo = 'teste.cobranca'),
  0,
  'um evento que só tem regra de sino não manda email ao externo'
);

select public.enviar_digests_diarios();

select is(
  (select count(*)::int from public.notification_queue
    where destinatario = 'a@fora.pt' and template_codigo = 'digest.resumo_diario'),
  1,
  'o resumo diário sai para o email externo'
);

select is(
  (select count(*)::int from public.notifications
    where destinatario_email_externo = 'a@fora.pt' and template_codigo = 'digest.resumo_diario'),
  1,
  'com a sua linha-mãe de resumo'
);

select is(
  (select digest_enviado_em is not null from public.notifications
    where rule_run_id = '00000000-0000-0000-0000-0000e4e00002' and destinatario_email_externo = 'a@fora.pt'),
  true,
  'e o aviso fica marcado como já resumido'
);

-- ── (5) Validação ──────────────────────────────────────────

select throws_ok(
  $$ insert into public.notificacao_emails_externos (org_id, email)
     values ('00000000-0000-0000-0000-0000008e0000', 'nao-e-email') $$,
  '23514',
  null,
  'endereço mal formado é recusado'
);

select throws_ok(
  $$ insert into public.notificacao_emails_externos (org_id, email)
     values ('00000000-0000-0000-0000-0000008e0000', 'a@FORA.pt') $$,
  '23505',
  null,
  'o mesmo endereço, noutra capitalização, não entra duas vezes'
);

select lives_ok(
  $$ insert into public.notificacao_emails_externos (org_id, email)
     values ('00000000-0000-0000-0000-0000008e0000', 'c@fora.pt') $$,
  'um endereço apagado pode voltar a ser acrescentado'
);

-- ── (6) Seed sem regras mudas ──────────────────────────────

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000008e0c00', 'Org Nova', 'emails-ext-c');

select is(
  (select count(*)::int from public.automation_rules r
    where r.org_id = '00000000-0000-0000-0000-0000008e0c00'
      and r.acao_tipo = 'notificacao'
      and coalesce(r.acao_config->>'destinatarios_estrategia', 'cargo') = 'cargo'
      and jsonb_array_length(coalesce(r.acao_config->'destinatarios_cargo_ids', '[]'::jsonb)) = 0),
  0,
  'numa organização nova nenhuma regra de notificação nasce sem grupo'
);

-- ── (4) e (7) Isolamento e grants ──────────────────────────

select ok(
  not has_function_privilege('anon', 'public.emails_externos_subscritos(uuid, text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.emails_externos_subscritos(uuid, text)', 'EXECUTE'),
  'só o dono da base chama a função de subscritos'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000008e0b01', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000008e0b01","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.notificacao_emails_externos),
  1,
  'o admin da org B só vê o email da org B'
);

select is(
  (select count(*)::int from public.notificacao_emails_externos_tipos),
  1,
  'e só as subscrições da org B'
);

reset role;
set local role anon;

select throws_ok(
  $$ select count(*) from public.notificacao_emails_externos $$,
  '42501',
  null,
  'o anónimo não lê a lista'
);

reset role;

select * from finish();
rollback;
