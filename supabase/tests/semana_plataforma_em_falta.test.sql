-- ============================================================
-- "Avisa quando uma semana de plataforma não chegou" (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Duas semanas com dados, duas sem. Gera-se UM evento por integração com as
-- duas semanas no payload — e o aviso chega mesmo ao sino do Administrador,
-- que foi o que falhou na primeira corrida em produção (2026-09-16): quatro
-- eventos `completed`, dois runs a dizer «8 notificações criadas», zero linhas
-- em `notificacoes`. Ver a migração 20260916100000.
-- ============================================================

begin;
select plan(14);

-- Bootstrap: consome a vaga de "primeiro utilizador da instalação" antes de
-- existir organização, para o handle_new_user_org não lhe atribuir org nem
-- escrever user_organizacoes/user_org_ativa por cima dos inserts manuais.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000001700ff', 'bootstrap@semana-falta.pt');

-- Inserir a organização dispara ensure_base_cargos (cria "Administrador") e
-- trigger_seed_alerta_semana_em_falta (cria a regra apontada a esse cargo).
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000170000', 'Org Semana Falta', 'sf-a');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000170a01', 'admin@semana-falta.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id)
select '00000000-0000-0000-0000-000000170a01', '00000000-0000-0000-0000-000000170000', true, c.id
  from public.cargos c
 where c.org_id = '00000000-0000-0000-0000-000000170000' and c.nome = 'Administrador';

-- get_current_org_id() (usado pela RLS de notificacoes) resolve por user_org_ativa.
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-000000170a01', '00000000-0000-0000-0000-000000170000');

insert into public.plataformas_configuracao (id, org_id, plataforma, nome, robot_target_platform, ativo) values
  ('00000000-0000-0000-0000-000000170b01', '00000000-0000-0000-0000-000000170000',
   'robot', 'Uber Semana Falta', 'uber', true);

-- Cinco semanas seguidas: −35, −14 e −7 têm dados, −28 e −21 ficam vazias.
-- A semana −7 leva dados de propósito: a tolerância de 3 dias só a exclui à
-- segunda e à terça; a partir de quarta já conta como em falta, e o conjunto
-- esperado mudava com o dia em que o CI corresse (foi assim que este ficheiro
-- falhou a 2026-09-16, uma quarta-feira).
-- uber_resumos_semanais exige chave_motorista e fonte; motorista_id fica nulo
-- porque o trigger resolver_motorista o reescreve a partir do uber_driver_id.
insert into public.uber_resumos_semanais
  (org_id, integracao_id, periodo, periodo_inicio, periodo_fim, chave_motorista, fonte, ganhos_brutos)
values
  ('00000000-0000-0000-0000-000000170000', '00000000-0000-0000-0000-000000170b01',
   'sem-1', (date_trunc('week', now())::date - 35), (date_trunc('week', now())::date - 29),
   'sf-motorista', 'csv', 900),
  ('00000000-0000-0000-0000-000000170000', '00000000-0000-0000-0000-000000170b01',
   'sem-4', (date_trunc('week', now())::date - 14), (date_trunc('week', now())::date - 8),
   'sf-motorista', 'csv', 950),
  ('00000000-0000-0000-0000-000000170000', '00000000-0000-0000-0000-000000170b01',
   'sem-5', (date_trunc('week', now())::date - 7), (date_trunc('week', now())::date - 1),
   'sf-motorista', 'csv', 980);

select public.emit_semanas_plataforma_em_falta_events();

-- 1. Duas semanas em falta → UM evento. Em produção eram dois eventos por
--    integração no mesmo lote, e o segundo batia no índice de «um run activo
--    por regra+entidade» e desaparecia sem rasto.
select is(
  (select count(*)::int from public.domain_events
    where event_type = 'plataforma.semana_em_falta'
      and entity_id = '00000000-0000-0000-0000-000000170b01'),
  1,
  'duas semanas em falta geram um único evento por integração'
);

-- 2. As duas semanas vão no payload, por ordem.
select is(
  (select payload->'semanas' from public.domain_events
    where event_type = 'plataforma.semana_em_falta'
      and entity_id = '00000000-0000-0000-0000-000000170b01'),
  jsonb_build_array(
    (date_trunc('week', now())::date - 28)::text,
    (date_trunc('week', now())::date - 21)::text
  ),
  'o payload lista exactamente as semanas sem uma única linha'
);

-- 3. A mensagem diz qual é a integração — é o que aparece no sino.
select ok(
  (select payload->>'mensagem' from public.domain_events
    where event_type = 'plataforma.semana_em_falta'
      and entity_id = '00000000-0000-0000-0000-000000170b01') like 'Uber Semana Falta: sem dados nas semanas de %',
  'a mensagem nomeia a integração'
);

-- 4. O evento fica na org certa. Um aviso destes a atravessar organizações
--    seria expor a uma frota os buracos de outra.
select is(
  (select org_id from public.domain_events
    where event_type = 'plataforma.semana_em_falta'
      and entity_id = '00000000-0000-0000-0000-000000170b01'),
  '00000000-0000-0000-0000-000000170000'::uuid,
  'o evento fica na organização da integração'
);

-- 5. Correr outra vez não duplica. É o cron diário: sem isto, as mesmas
--    semanas avisavam todos os dias até alguém as corrigir.
select public.emit_semanas_plataforma_em_falta_events();
select is(
  (select count(*)::int from public.domain_events
    where event_type = 'plataforma.semana_em_falta'
      and entity_id = '00000000-0000-0000-0000-000000170b01'),
  1,
  'correr o cron de novo não emite o mesmo aviso outra vez'
);

-- 6. Tolerância de 3 dias: nenhuma semana avisada acabou há menos de 3 dias —
--    o relatório da Uber pode nem existir. Escrito como propriedade sobre o
--    que foi emitido, e não como exemplo de uma semana concreta, porque a
--    semana concreta que cai na tolerância muda com o dia em que o teste corre.
select is(
  (select count(*)::int
     from public.domain_events d
     cross join lateral jsonb_array_elements_text(d.payload->'semanas') s(semana)
    where d.event_type = 'plataforma.semana_em_falta'
      and s.semana::date + 6 > current_date - 3),
  0,
  'nenhuma semana avisada acabou há menos de 3 dias'
);

-- ── A cadeia até ao sino ─────────────────────────────────────────────────
select public.process_domain_events();
select public.execute_automation_runs();

-- 7. O run existe e concluiu.
select is(
  (select r.status from public.automation_runs r
     join public.automation_rules ru on ru.id = r.rule_id
    where ru.event_type = 'plataforma.semana_em_falta'
      and r.entity_id = '00000000-0000-0000-0000-000000170b01'),
  'completed',
  'o evento gera um run e o run conclui'
);

-- 8. E há uma linha em `notificacoes` — a tabela que o sino lê — para o
--    Administrador, com o tipo do mapa. Era isto que não existia.
select is(
  (select count(*)::int from public.notificacoes
    where org_id = '00000000-0000-0000-0000-000000170000'
      and tipo = 'plataforma_semana_em_falta'
      and destinatario_id = '00000000-0000-0000-0000-000000170a01'),
  1,
  'o Administrador recebe a notificação no sino, com o tipo vindo de notificacao_tipo_map'
);

-- 9. Com a mensagem do payload, não em branco.
select is(
  (select mensagem from public.notificacoes
    where tipo = 'plataforma_semana_em_falta'
      and destinatario_id = '00000000-0000-0000-0000-000000170a01'),
  'Uber Semana Falta: sem dados nas semanas de '
    || to_char(date_trunc('week', now())::date - 28, 'DD/MM') || ', '
    || to_char(date_trunc('week', now())::date - 21, 'DD/MM'),
  'a notificação traz a mensagem do payload'
);

-- 10. E o link leva às integrações, identificando esta.
select is(
  (select link from public.notificacoes
    where tipo = 'plataforma_semana_em_falta'
      and destinatario_id = '00000000-0000-0000-0000-000000170a01'),
  '/admin/settings?integracao=00000000-0000-0000-0000-000000170b01',
  'o link aponta para a página de integrações com o id da integração'
);

-- 11. Visível pela RLS — exactamente o que useNotificacoes.ts lê. A policy
--     enumerava 22 tipos; qualquer tipo fora da lista era invisível ao
--     próprio destinatário.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000170a01', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000170a01","role":"authenticated"}',
  true
);

select is(
  (select count(*)::int from public.notificacoes
    where resolvida = false and tipo = 'plataforma_semana_em_falta'),
  1,
  'o destinatário vê a notificação através da RLS'
);

reset role;

-- ── Novidades e não-novidades ────────────────────────────────────────────

-- 12. Preencher uma das semanas em falta não é novidade: nada a avisar.
insert into public.uber_resumos_semanais
  (org_id, integracao_id, periodo, periodo_inicio, periodo_fim, chave_motorista, fonte, ganhos_brutos)
values
  ('00000000-0000-0000-0000-000000170000', '00000000-0000-0000-0000-000000170b01',
   'sem-3', (date_trunc('week', now())::date - 21), (date_trunc('week', now())::date - 15),
   'sf-motorista', 'csv', 920);

select public.emit_semanas_plataforma_em_falta_events();
select is(
  (select count(*)::int from public.domain_events
    where event_type = 'plataforma.semana_em_falta'
      and entity_id = '00000000-0000-0000-0000-000000170b01'),
  1,
  'uma semana que passa a ter dados não gera aviso novo'
);

-- 13. Uma semana que passa a estar em falta é novidade: evento novo, com o
--     conjunto completo do momento (−28 continua em falta, −14 é a nova).
delete from public.uber_resumos_semanais
 where periodo = 'sem-4' and integracao_id = '00000000-0000-0000-0000-000000170b01';

select public.emit_semanas_plataforma_em_falta_events();
-- Os dois eventos nascem na mesma transacção (mesmo created_at); o novo
-- identifica-se por ser o único que fala da semana −14.
select is(
  (select payload->'semanas' from public.domain_events
    where event_type = 'plataforma.semana_em_falta'
      and entity_id = '00000000-0000-0000-0000-000000170b01'
      and payload->'semanas' ? (date_trunc('week', now())::date - 14)::text),
  jsonb_build_array(
    (date_trunc('week', now())::date - 28)::text,
    (date_trunc('week', now())::date - 14)::text
  ),
  'uma semana nova em falta gera evento novo com o conjunto completo'
);

-- 14. Uma integração sem histórico nenhum não se queixa. Sem isto, cada
--     integração nova gerava 8 avisos no primeiro dia de vida.
insert into public.plataformas_configuracao (id, org_id, plataforma, nome, robot_target_platform, ativo) values
  ('00000000-0000-0000-0000-000000170b02', '00000000-0000-0000-0000-000000170000',
   'robot', 'Uber Acabada de Criar', 'uber', true);

select public.emit_semanas_plataforma_em_falta_events();
select is(
  (select count(*)::int from public.domain_events
    where event_type = 'plataforma.semana_em_falta'
      and entity_id = '00000000-0000-0000-0000-000000170b02'),
  0,
  'integração sem histórico não reclama das semanas que nunca teve'
);

select * from finish();
rollback;
