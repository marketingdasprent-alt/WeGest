-- ============================================================
-- "Contrato alterado" — domain event + sino + email ao Administrador (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Alterar estado/motorista/viatura/datas/km de um contrato publica
-- contrato.alterado, e a cadeia chega ao Administrador: linha em
-- `notificacoes` (sino) pela regra 'notificacao' e linha em
-- `notification_queue` pela gémea 'email'. Outro cargo NÃO recebe — os
-- destinatários são só os da regra, editáveis na aba de automações.
-- Ver a migração 20260923100000.
-- ============================================================

begin;
select plan(14);

-- Bootstrap: consome a vaga de "primeiro utilizador da instalação" antes de
-- existir organização (ver semana_plataforma_em_falta.test.sql).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000001900ff', 'bootstrap@contrato-alterado.pt');

-- Inserir a organização dispara ensure_base_cargos ("Administrador") e
-- trigger_seed_alerta_contrato_alterado (as duas regras gémeas).
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000190000', 'Org Contrato Alterado', 'co-a');

-- Cargo fora da regra: prova que só o Administrador recebe.
insert into public.cargos (id, org_id, nome) values
  ('00000000-0000-0000-0000-000000190c10', '00000000-0000-0000-0000-000000190000', 'Operações');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000190a01', 'admin@contrato-alterado.pt'),
  ('00000000-0000-0000-0000-000000190a02', 'operacoes@contrato-alterado.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id)
select '00000000-0000-0000-0000-000000190a01', '00000000-0000-0000-0000-000000190000', true, c.id
  from public.cargos c
 where c.org_id = '00000000-0000-0000-0000-000000190000' and c.nome = 'Administrador';

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-000000190a02', '00000000-0000-0000-0000-000000190000', false,
   '00000000-0000-0000-0000-000000190c10');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-000000190a01', '00000000-0000-0000-0000-000000190000'),
  ('00000000-0000-0000-0000-000000190a02', '00000000-0000-0000-0000-000000190000');

insert into public.motoristas_ativos (id, org_id, nome) values
  ('00000000-0000-0000-0000-000000190b01', '00000000-0000-0000-0000-000000190000', 'Motorista Contrato');

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-000000190d01', '00000000-0000-0000-0000-000000190000', 'Seat');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-000000190e01', '00000000-0000-0000-0000-000000190000',
   '00000000-0000-0000-0000-000000190d01', 'Leon');
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id) values
  ('00000000-0000-0000-0000-000000190f01', '00000000-0000-0000-0000-000000190000', 'CA-01-CO',
   '00000000-0000-0000-0000-000000190d01', '00000000-0000-0000-0000-000000190e01');

insert into public.empresas (id, nome, nome_completo) values
  ('emp-contrato-alterado', 'Empresa CA', 'Empresa Contrato Alterado Lda')
on conflict (id) do nothing;

insert into public.contratos
  (id, org_id, motorista_id, motorista_nome, empresa_id, numero_contrato, status,
   data_inicio, data_assinatura, cidade_assinatura, duracao_meses)
values
  ('00000000-0000-0000-0000-000000190001', '00000000-0000-0000-0000-000000190000',
   '00000000-0000-0000-0000-000000190b01', 'Motorista Contrato', 'emp-contrato-alterado', 77, 'ativo',
   date '2026-09-01', date '2026-09-01', 'Lisboa', 12);

-- ── Seed por organização ─────────────────────────────────────────────────

-- 1. Uma automação, duas acções: sino + email, no mesmo grupo.
select is(
  (select count(distinct grupo_id)::int from public.automation_rules
    where org_id = '00000000-0000-0000-0000-000000190000'
      and event_type = 'contrato.alterado'
      and acao_tipo in ('notificacao', 'email')
      and ativo),
  1,
  'a organização nova recebe as regras gémeas notificacao+email no mesmo grupo_id'
);

select is(
  (select count(*)::int from public.automation_rules
    where org_id = '00000000-0000-0000-0000-000000190000'
      and event_type = 'contrato.alterado'),
  2,
  'são exactamente duas regras: uma para o sino, uma para o email'
);

-- 2. As duas regras apontam só para o Administrador.
select is(
  (select count(*)::int from public.automation_rules r
    where r.org_id = '00000000-0000-0000-0000-000000190000'
      and r.event_type = 'contrato.alterado'
      and r.acao_config->'destinatarios_cargo_ids' = (
        select jsonb_build_array(c.id) from public.cargos c
         where c.org_id = r.org_id and c.nome = 'Administrador')),
  2,
  'as duas regras têm como destinatário apenas o cargo Administrador'
);

-- 3. O template de email usa variáveis que o payload fornece.
select ok(
  (select corpo_template from public.notification_templates
    where org_id = '00000000-0000-0000-0000-000000190000'
      and codigo = 'contrato.alterado' and canal = 'email' and ativo)
  like '%{{alteracoes_texto}}%',
  'o template de email referencia {{alteracoes_texto}}, que o trigger fornece'
);

-- ── O que NÃO é alteração ────────────────────────────────────────────────

-- 4. Mexer no combustível do check-in não avisa ninguém.
update public.contratos set combustivel_checkin = '1/2'
 where id = '00000000-0000-0000-0000-000000190001';

select is(
  (select count(*)::int from public.domain_events
    where event_type = 'contrato.alterado'
      and entity_id = '00000000-0000-0000-0000-000000190001'),
  0,
  'alterar só o combustível não publica evento'
);

-- ── Uma alteração real: viatura + km de check-out ────────────────────────

update public.contratos
   set viatura_id  = '00000000-0000-0000-0000-000000190f01',
       km_checkout = 12345
 where id = '00000000-0000-0000-0000-000000190001';

-- 5. Duas colunas mudaram, UM evento.
select is(
  (select count(*)::int from public.domain_events
    where event_type = 'contrato.alterado'
      and entity_id = '00000000-0000-0000-0000-000000190001'),
  1,
  'atribuir viatura e km de check-out publica um único evento'
);

-- 6. Classificado como alteração das partes (viatura pesa mais que km).
select is(
  (select payload->>'alteracao' from public.domain_events
    where event_type = 'contrato.alterado'
      and entity_id = '00000000-0000-0000-0000-000000190001'),
  'partes',
  'o payload classifica a alteração como "partes"'
);

-- 7. A mensagem nomeia o contrato e resolve a viatura pela matrícula.
select is(
  (select payload->>'mensagem' from public.domain_events
    where event_type = 'contrato.alterado'
      and entity_id = '00000000-0000-0000-0000-000000190001'),
  'Contrato nº 77 de Motorista Contrato — viatura: sem viatura → CA-01-CO; km check-out: — → 12345',
  'a mensagem nomeia o contrato, o motorista e as alterações'
);

-- ── A cadeia até ao sino e à fila de email ───────────────────────────────
select public.process_domain_events();
select public.execute_automation_runs();

-- 8. Sino: só o Administrador recebe; Operações não está na regra.
select is(
  (select array_agg(distinct destinatario_id) from public.notificacoes
    where org_id = '00000000-0000-0000-0000-000000190000'
      and tipo = 'contrato_alterado'),
  array['00000000-0000-0000-0000-000000190a01'::uuid],
  'só o Administrador recebe a notificação no sino'
);

select ok(
  (select mensagem from public.notificacoes
    where tipo = 'contrato_alterado'
      and destinatario_id = '00000000-0000-0000-0000-000000190a01')
  like 'Contrato nº 77 de Motorista Contrato — %',
  'a notificação traz a mensagem do payload'
);

-- 9. Email: a gémea mete uma linha na fila só para o Administrador.
select is(
  (select array_agg(destinatario order by destinatario) from public.notification_queue
    where org_id = '00000000-0000-0000-0000-000000190000'
      and canal = 'email'
      and template_codigo = 'contrato.alterado'),
  array['admin@contrato-alterado.pt'],
  'a regra gémea de email põe o aviso na fila só para o Administrador'
);

-- ── Segunda alteração: não é suprimida ───────────────────────────────────
-- Sem link de entidade, process_domain_events não a trata como «aviso em
-- aberto»; fn_notificacoes_agrupar junta-a ao aviso do dia em `itens`.

update public.contratos set status = 'encerrado', data_fim = date '2026-09-23'
 where id = '00000000-0000-0000-0000-000000190001';

select is(
  (select payload->>'alteracao' from public.domain_events
    where event_type = 'contrato.alterado'
      and entity_id = '00000000-0000-0000-0000-000000190001'
      -- Mesma transacção = mesmo now(); ordenar por created_at empata.
      and payload->>'status' = 'encerrado'),
  'estado',
  'encerrar o contrato classifica-se como "estado"'
);

select public.process_domain_events();
select public.execute_automation_runs();

select is(
  (select itens from public.notificacoes
    where org_id = '00000000-0000-0000-0000-000000190000'
      and tipo = 'contrato_alterado'
      and destinatario_id = '00000000-0000-0000-0000-000000190a01')
    @> jsonb_build_array(
         jsonb_build_object('mensagem', 'Contrato nº 77 de Motorista Contrato — viatura: sem viatura → CA-01-CO; km check-out: — → 12345'),
         -- data_fim nasce preenchida por contratos_preencher_data_fim (início + 12 meses).
         jsonb_build_object('mensagem', 'Contrato nº 77 de Motorista Contrato — estado: ativo → encerrado; fim: 01/09/2027 → 23/09/2026')
       ),
  true,
  'encerrar o contrato com o primeiro aviso por resolver junta o segundo facto ao mesmo aviso (não é suprimido)'
);

-- 10. Visível pela RLS — exactamente o que useNotificacoes.ts lê.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000190a01', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000190a01","role":"authenticated"}',
  true
);

select is(
  (select agrupadas::int from public.notificacoes
    where resolvida = false and tipo = 'contrato_alterado'),
  2,
  'o destinatário vê o aviso através da RLS, com os dois factos agrupados'
);

reset role;

select * from finish();
rollback;
