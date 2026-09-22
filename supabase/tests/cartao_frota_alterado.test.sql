-- ============================================================
-- "Cartão de frota alterado" — domain event + sino + email (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Alterar titular/estado/plafond de um cartão publica cartao_frota.alterado,
-- e a cadeia inteira chega ao Administrador: linha em `notificacoes` (sino)
-- pela regra 'notificacao' e linha em `notification_queue` pela gémea
-- 'email'. Uma segunda alteração ao mesmo cartão NÃO é suprimida como
-- «aviso em aberto» — é outro facto. Ver a migração 20260922130000.
-- ============================================================

begin;
select plan(14);

-- Bootstrap: consome a vaga de "primeiro utilizador da instalação" antes de
-- existir organização (ver semana_plataforma_em_falta.test.sql).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000001800ff', 'bootstrap@cartao-alterado.pt');

-- Inserir a organização dispara ensure_base_cargos ("Administrador") e
-- trigger_seed_alerta_cartao_frota_alterado (as duas regras gémeas).
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000180000', 'Org Cartao Alterado', 'ca-a');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000180a01', 'admin@cartao-alterado.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id)
select '00000000-0000-0000-0000-000000180a01', '00000000-0000-0000-0000-000000180000', true, c.id
  from public.cargos c
 where c.org_id = '00000000-0000-0000-0000-000000180000' and c.nome = 'Administrador';

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-000000180a01', '00000000-0000-0000-0000-000000180000');

insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-000000180b01', '00000000-0000-0000-0000-000000180000', 'Motorista Cartao');

insert into public.cartoes_frota (id, org_id, numero, tipo, status, ativo, notas) values
  ('00000000-0000-0000-0000-000000180c01', '00000000-0000-0000-0000-000000180000',
   '1006', 'repsol', 'disponivel', true, 'nota inicial');

-- ── Seed por organização ─────────────────────────────────────────────────

-- 1. Uma automação, duas acções: sino + email, no mesmo grupo.
select is(
  (select count(distinct grupo_id)::int from public.automation_rules
    where org_id = '00000000-0000-0000-0000-000000180000'
      and event_type = 'cartao_frota.alterado'
      and acao_tipo in ('notificacao', 'email')
      and ativo),
  1,
  'a organização nova recebe as regras gémeas notificacao+email no mesmo grupo_id'
);

select is(
  (select count(*)::int from public.automation_rules
    where org_id = '00000000-0000-0000-0000-000000180000'
      and event_type = 'cartao_frota.alterado'),
  2,
  'são exactamente duas regras: uma para o sino, uma para o email'
);

-- 2. O template de email existe e usa variáveis que o payload fornece.
select ok(
  (select corpo_template from public.notification_templates
    where org_id = '00000000-0000-0000-0000-000000180000'
      and codigo = 'cartao_frota.alterado' and canal = 'email' and ativo)
  like '%{{alteracoes_texto}}%',
  'o template de email referencia {{alteracoes_texto}}, que o trigger fornece'
);

-- ── O que NÃO é alteração ────────────────────────────────────────────────

-- 3. Mexer nas notas não avisa ninguém.
update public.cartoes_frota set notas = 'outra nota'
 where id = '00000000-0000-0000-0000-000000180c01';

select is(
  (select count(*)::int from public.domain_events
    where event_type = 'cartao_frota.alterado'
      and entity_id = '00000000-0000-0000-0000-000000180c01'),
  0,
  'alterar só as notas não publica evento'
);

-- ── Atribuição: o mesmo UPDATE que atribuir_cartao_frota faz ────────────

update public.cartoes_frota
   set motorista_id = '00000000-0000-0000-0000-000000180b01',
       status       = 'em_uso',
       data_entrega = date '2026-09-22'
 where id = '00000000-0000-0000-0000-000000180c01';

-- 4. Três colunas mudaram, UM evento.
select is(
  (select count(*)::int from public.domain_events
    where event_type = 'cartao_frota.alterado'
      and entity_id = '00000000-0000-0000-0000-000000180c01'),
  1,
  'uma atribuição (motorista + estado + data) publica um único evento'
);

-- 5. Classificado como alteração de titular — é o que as condições filtram.
select is(
  (select payload->>'alteracao' from public.domain_events
    where event_type = 'cartao_frota.alterado'
      and entity_id = '00000000-0000-0000-0000-000000180c01'),
  'titular',
  'o payload classifica a alteração como "titular"'
);

-- 6. A lista de alterações tem as três, com o titular resolvido pelo nome.
select is(
  (select jsonb_array_length(payload->'alteracoes') from public.domain_events
    where event_type = 'cartao_frota.alterado'
      and entity_id = '00000000-0000-0000-0000-000000180c01'),
  3,
  'o payload lista as três colunas alteradas'
);

select is(
  (select payload->>'titular_depois' from public.domain_events
    where event_type = 'cartao_frota.alterado'
      and entity_id = '00000000-0000-0000-0000-000000180c01'),
  'Motorista Cartao',
  'o titular novo vai pelo nome, não pelo uuid'
);

-- 7. A mensagem nomeia o cartão e diz o que mudou — é o que aparece no sino.
select ok(
  (select payload->>'mensagem' from public.domain_events
    where event_type = 'cartao_frota.alterado'
      and entity_id = '00000000-0000-0000-0000-000000180c01')
  like 'Cartão Repsol nº 1006 — titular: sem titular → Motorista Cartao; estado: disponivel → em_uso%',
  'a mensagem nomeia o cartão e as alterações'
);

-- ── A cadeia até ao sino e à fila de email ───────────────────────────────
select public.process_domain_events();
select public.execute_automation_runs();

-- 8. Sino: uma linha em `notificacoes` para o Administrador, com o tipo do
--    mapa e a mensagem do payload.
select is(
  (select count(*)::int from public.notificacoes
    where org_id = '00000000-0000-0000-0000-000000180000'
      and tipo = 'cartao_frota_alterado'
      and destinatario_id = '00000000-0000-0000-0000-000000180a01'),
  1,
  'o Administrador recebe a notificação no sino'
);

select ok(
  (select mensagem from public.notificacoes
    where tipo = 'cartao_frota_alterado'
      and destinatario_id = '00000000-0000-0000-0000-000000180a01')
  like 'Cartão Repsol nº 1006 — %',
  'a notificação traz a mensagem do payload'
);

-- 9. Email: a gémea mete uma linha na fila para o email do Administrador.
select is(
  (select count(*)::int from public.notification_queue
    where org_id = '00000000-0000-0000-0000-000000180000'
      and canal = 'email'
      and destinatario = 'admin@cartao-alterado.pt'
      and template_codigo = 'cartao_frota.alterado'),
  1,
  'a regra gémea de email põe o aviso na fila para o Administrador'
);

-- ── Segunda alteração: não é suprimida ───────────────────────────────────
-- process_domain_events ignora um evento quando já há aviso por resolver com
-- o mesmo (tipo, link). Para alterações isso escondia a devolução atrás da
-- atribuição — por isso o evento não tem link de entidade.

update public.cartoes_frota
   set motorista_id        = null,
       ultimo_motorista_id = '00000000-0000-0000-0000-000000180b01',
       status              = 'disponivel',
       data_devolucao      = date '2026-09-22'
 where id = '00000000-0000-0000-0000-000000180c01';

select public.process_domain_events();
select public.execute_automation_runs();

-- O motor não o suprimiu (sem link não há «aviso em aberto»); quem o junta ao
-- primeiro é fn_notificacoes_agrupar — mesmo dia, tipo e destinatário dão UMA
-- linha no sino com os dois factos em `itens`. Isto foi o que o CI mostrou na
-- primeira corrida: esperava-se 2 linhas e vinha 1 com agrupadas = 2.
select is(
  (select itens from public.notificacoes
    where org_id = '00000000-0000-0000-0000-000000180000'
      and tipo = 'cartao_frota_alterado'
      and destinatario_id = '00000000-0000-0000-0000-000000180a01')
    @> jsonb_build_array(
         jsonb_build_object('mensagem', 'Cartão Repsol nº 1006 — titular: sem titular → Motorista Cartao; estado: disponivel → em_uso; data de entrega: — → 22/09/2026'),
         jsonb_build_object('mensagem', 'Cartão Repsol nº 1006 — titular: Motorista Cartao → sem titular; estado: em_uso → disponivel; data de devolução: — → 22/09/2026')
       ),
  true,
  'devolver o cartão com o primeiro aviso por resolver junta o segundo facto ao mesmo aviso no sino (não é suprimido)'
);

-- 10. Visível pela RLS — exactamente o que useNotificacoes.ts lê.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000180a01', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000180a01","role":"authenticated"}',
  true
);

select is(
  (select agrupadas::int from public.notificacoes
    where resolvida = false and tipo = 'cartao_frota_alterado'),
  2,
  'o destinatário vê o aviso através da RLS, com os dois factos agrupados'
);

reset role;

select * from finish();
rollback;
