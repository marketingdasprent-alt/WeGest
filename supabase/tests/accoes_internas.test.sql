-- ============================================================
-- Acções internas — MVP (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- A garantia sob teste: o motor executa uma pequena tarefa interna de forma
-- segura, previsível e repetível — e não consegue ser levado a fazer mais do
-- que aquilo que o catálogo permite.
--
-- ── O QUE O `linhas` PROVA ──────────────────────────────────────────────────
--
-- Cada handler devolve quantas linhas actualizou, e isso fica em
-- `automation_logs.detalhe`. É por aí que se prova a idempotência: não basta
-- «o valor final está certo» — no retry tem de ser ZERO linhas, que é o que
-- garante que nenhum trigger da tabela chegou a correr.
--
-- ── PORQUE event_types INVENTADOS ───────────────────────────────────────────
--
-- Criar uma organização semeia as regras por omissão. Com um event_type real,
-- cada evento casaria também com a regra semeada e nasceriam runs a mais.
-- ============================================================

begin;
select plan(18);

-- ── Cenário ─────────────────────────────────────────────────
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-00000000a100', 'Org MVP A', 'mvp-a'),
  ('00000000-0000-0000-0000-00000000b100', 'Org MVP B', 'mvp-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a101', 'admin@mvp.pt'),
  ('00000000-0000-0000-0000-00000000a102', 'semperm@mvp.pt');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a100'),
  ('00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-00000000a100');

insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-0000000c1100', 'Sem Permissoes', '00000000-0000-0000-0000-00000000a100');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a100', true,  null),
  ('00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-00000000a100', false, '00000000-0000-0000-0000-0000000c1100');

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-00008a4a1100', '00000000-0000-0000-0000-00000000a100', 'Seat');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-00008e4a1100', '00000000-0000-0000-0000-00000000a100',
   '00000000-0000-0000-0000-00008a4a1100', 'Leon');

insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id) values
  ('00000000-0000-0000-0000-0000087a1101', '00000000-0000-0000-0000-00000000a100', 'MV-01-PA',
   '00000000-0000-0000-0000-00008a4a1100', '00000000-0000-0000-0000-00008e4a1100');

-- A viatura da org B existe só para o teste de cross-tenant.
insert into public.viaturas (id, org_id, matricula, marca, modelo) values
  ('00000000-0000-0000-0000-0000087b1101', '00000000-0000-0000-0000-00000000b100', 'MV-99-PB', 'Seat', 'Leon');

insert into public.motoristas_ativos (id, org_id, nome, observacoes) values
  ('00000000-0000-0000-0000-0000000e1101', '00000000-0000-0000-0000-00000000a100', 'Motorista MVP', null);

insert into public.assistencia_tickets (id, org_id, viatura_id, titulo, status, prioridade) values
  ('00000000-0000-0000-0000-0000007c1101', '00000000-0000-0000-0000-00000000a100',
   '00000000-0000-0000-0000-0000087a1101', 'Ticket MVP', 'aberto', 'baixa');

-- ════════════════════════════════════════════════════════════
-- O catálogo
-- ════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from jsonb_object_keys(public.automation_catalogo() -> 'accoes')),
  3,
  'o catálogo declara exactamente três acções'
);

-- ════════════════════════════════════════════════════════════
-- Execução normal e retry — motorista
-- ════════════════════════════════════════════════════════════
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-0000004a1101', '00000000-0000-0000-0000-00000000a100',
   'teste.mvp_motorista', 'MVP Motorista', 'teste.mvp_motorista', 'automacao_interna',
   '{"accao":"motorista.atualizar_campo","campo":"observacoes","valor":"Ficha por rever"}'::jsonb);

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-00000c4a1101', '00000000-0000-0000-0000-0000004a1101',
   '00000000-0000-0000-0000-00000000a100', 'motoristas_ativos', '00000000-0000-0000-0000-0000000e1101');

select public.execute_automation_runs();

select is(
  (select observacoes from public.motoristas_ativos where id = '00000000-0000-0000-0000-0000000e1101'),
  'Ficha por rever',
  'a acção escreve o valor configurado no campo do motorista'
);

select is(
  (select detalhe->>'linhas' from public.automation_logs
    where run_id = '00000000-0000-0000-0000-00000c4a1101' and evento = 'executada'),
  '1',
  'a primeira execução actualiza uma linha'
);

-- Retry: o mesmo run devolvido a pending, como o varrimento de presos faz.
update public.automation_runs
   set status = 'pending', started_at = null, next_attempt_at = now()
 where id = '00000000-0000-0000-0000-00000c4a1101';

select public.execute_automation_runs();

select is(
  (select count(*)::int from public.automation_logs
    where run_id = '00000000-0000-0000-0000-00000c4a1101' and evento = 'executada'
      and detalhe->>'linhas' = '0'),
  1,
  'o retry actualiza ZERO linhas — nenhum trigger da tabela chega a correr'
);

-- ════════════════════════════════════════════════════════════
-- Viatura e ticket
-- ════════════════════════════════════════════════════════════
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-0000004a1102', '00000000-0000-0000-0000-00000000a100',
   'teste.mvp_viatura', 'MVP Viatura', 'teste.mvp_viatura', 'automacao_interna',
   '{"accao":"viatura.atualizar_campo","campo":"observacoes","valor":"Seguro a expirar"}'::jsonb),
  ('00000000-0000-0000-0000-0000004a1103', '00000000-0000-0000-0000-00000000a100',
   'teste.mvp_ticket', 'MVP Ticket', 'teste.mvp_ticket', 'automacao_interna',
   '{"accao":"ticket.alterar_estado","valor":"em_andamento"}'::jsonb);

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-00000c4a1102', '00000000-0000-0000-0000-0000004a1102',
   '00000000-0000-0000-0000-00000000a100', 'viaturas', '00000000-0000-0000-0000-0000087a1101'),
  ('00000000-0000-0000-0000-00000c4a1103', '00000000-0000-0000-0000-0000004a1103',
   '00000000-0000-0000-0000-00000000a100', 'assistencia_tickets', '00000000-0000-0000-0000-0000007c1101');

select public.execute_automation_runs();

select is(
  (select observacoes from public.viaturas where id = '00000000-0000-0000-0000-0000087a1101'),
  'Seguro a expirar',
  'a acção escreve na observação da viatura'
);

select is(
  (select status from public.assistencia_tickets where id = '00000000-0000-0000-0000-0000007c1101'),
  'em_andamento',
  'a acção altera o estado do ticket'
);

-- ════════════════════════════════════════════════════════════
-- Validação na escrita — 23514 é check_violation
-- ════════════════════════════════════════════════════════════
select throws_ok(
  $$insert into public.automation_rules (org_id, codigo, nome, event_type, acao_tipo, acao_config)
    values ('00000000-0000-0000-0000-00000000a100', 'teste.mvp_mau_campo', 'X', 'teste.x', 'automacao_interna',
            '{"accao":"motorista.atualizar_campo","campo":"iban","valor":"PT50"}'::jsonb)$$,
  '23514', null,
  'um campo fora da allowlist é recusado na escrita'
);

select throws_ok(
  $$insert into public.automation_rules (org_id, codigo, nome, event_type, acao_tipo, acao_config)
    values ('00000000-0000-0000-0000-00000000a100', 'teste.mvp_ma_accao', 'X', 'teste.x', 'automacao_interna',
            '{"accao":"motorista.apagar","valor":"x"}'::jsonb)$$,
  '23514', null,
  'uma acção que não existe no catálogo é recusada na escrita'
);

select throws_ok(
  $$insert into public.automation_rules (org_id, codigo, nome, event_type, acao_tipo, acao_config)
    values ('00000000-0000-0000-0000-00000000a100', 'teste.mvp_mau_valor', 'X', 'teste.x', 'automacao_interna',
            '{"accao":"ticket.alterar_estado","valor":"em_ferias"}'::jsonb)$$,
  '23514', null,
  'um estado fora do conjunto fechado é recusado na escrita'
);

select throws_ok(
  $$insert into public.automation_rules (org_id, codigo, nome, event_type, acao_tipo, acao_config)
    values ('00000000-0000-0000-0000-00000000a100', 'teste.mvp_sem_valor', 'X', 'teste.x', 'automacao_interna',
            '{"accao":"ticket.alterar_estado"}'::jsonb)$$,
  '23514', null,
  'uma acção sem valor é recusada na escrita'
);

-- ── Permissão ───────────────────────────────────────────────
-- O utilizador tem cargo, mas o cargo não tem `motoristas_editar`.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a102', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a102","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.automation_rules (org_id, codigo, nome, event_type, acao_tipo, acao_config)
    values ('00000000-0000-0000-0000-00000000a100', 'teste.mvp_sem_perm', 'X', 'teste.x', 'automacao_interna',
            '{"accao":"motorista.atualizar_campo","campo":"observacoes","valor":"x"}'::jsonb)$$,
  '23514', null,
  'quem não tem o recurso da acção não a consegue configurar'
);

reset role;

-- ════════════════════════════════════════════════════════════
-- Cross-tenant: o guarda está no próprio handler
-- ════════════════════════════════════════════════════════════
select is(
  (select public.fn_accao_viatura_atualizar_campo(
            '00000000-0000-0000-0000-00000000a100',          -- org A
            '00000000-0000-0000-0000-0000087b1101',          -- viatura da org B
            '{"campo":"observacoes","valor":"invadido"}'::jsonb) ->> 'linhas'),
  '0',
  'o handler não escreve numa entidade de outra organização, mesmo com o UUID certo'
);

select is(
  (select observacoes from public.viaturas where id = '00000000-0000-0000-0000-0000087b1101'),
  null,
  'e a entidade da org B fica intacta'
);

-- ════════════════════════════════════════════════════════════
-- Snapshot: editar a automação não muda o run já criado
-- ════════════════════════════════════════════════════════════
insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-00000c4a1104', '00000000-0000-0000-0000-0000004a1103',
   '00000000-0000-0000-0000-00000000a100', 'assistencia_tickets', '00000000-0000-0000-0000-0000007c1101');

update public.automation_rules
   set acao_config = '{"accao":"ticket.alterar_estado","valor":"fechado"}'::jsonb
 where id = '00000000-0000-0000-0000-0000004a1103';

select public.execute_automation_runs();

select is(
  (select status from public.assistencia_tickets where id = '00000000-0000-0000-0000-0000007c1101'),
  'em_andamento',
  'o run criado antes da edição executa a configuração antiga, não a nova'
);

-- ════════════════════════════════════════════════════════════
-- Condição falsa: a acção não corre
-- ════════════════════════════════════════════════════════════
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, condicoes, acao_config) values
  ('00000000-0000-0000-0000-0000004a1105', '00000000-0000-0000-0000-00000000a100',
   'teste.mvp_cond', 'MVP Condicao', 'teste.mvp_cond', 'automacao_interna',
   '[{"campo":"prioridade","operador":"=","valor":"urgente"}]'::jsonb,
   '{"accao":"ticket.alterar_estado","valor":"resolvido"}'::jsonb);

insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by, occurred_at, payload) values
  ('00000000-0000-0000-0000-00000e0a1101', '00000000-0000-0000-0000-00000000a100',
   'teste.mvp_cond', 'assistencia_tickets', '00000000-0000-0000-0000-0000007c1101', 'manual',
   now() - interval '2 minutes', '{"prioridade":"baixa"}'::jsonb);

select public.process_domain_events();
select public.execute_automation_runs();

select is(
  (select status from public.assistencia_tickets where id = '00000000-0000-0000-0000-0000007c1101'),
  'em_andamento',
  'condição não satisfeita: a acção não corre e o estado fica como estava'
);

-- ════════════════════════════════════════════════════════════
-- Isolamento por REGRA
-- ════════════════════════════════════════════════════════════
-- Três regras casam com o mesmo evento. A do meio rebenta no insert do run,
-- por um trigger de teste — o mesmo veneno determinístico que a Fase 1 usa,
-- porque um erro genuíno é por definição imprevisível.
insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-0000004a11a1', '00000000-0000-0000-0000-00000000a100',
   'teste.mvp_iso_a', 'Iso A', 'teste.mvp_iso', 'automacao_interna',
   '{"accao":"viatura.atualizar_campo","campo":"observacoes","valor":"A passou"}'::jsonb),
  ('00000000-0000-0000-0000-0000004a11b1', '00000000-0000-0000-0000-00000000a100',
   'teste.mvp_iso_b', 'Iso B', 'teste.mvp_iso', 'automacao_interna',
   '{"accao":"viatura.atualizar_campo","campo":"observacoes","valor":"B nunca"}'::jsonb),
  ('00000000-0000-0000-0000-0000004a11c1', '00000000-0000-0000-0000-00000000a100',
   'teste.mvp_iso_c', 'Iso C', 'teste.mvp_iso', 'automacao_interna',
   '{"accao":"viatura.atualizar_campo","campo":"observacoes","valor":"C passou"}'::jsonb);

create function pg_temp.envenenar_regra() returns trigger language plpgsql as $$
begin
  if NEW.rule_id = '00000000-0000-0000-0000-0000004a11b1' then
    raise exception 'veneno de teste na regra B';
  end if;
  return NEW;
end;
$$;

create trigger trg_veneno_regra
  before insert on public.automation_runs
  for each row execute function pg_temp.envenenar_regra();

insert into public.domain_events (id, org_id, event_type, entity_table, entity_id, emitted_by, occurred_at) values
  ('00000000-0000-0000-0000-00000e0a1102', '00000000-0000-0000-0000-00000000a100',
   'teste.mvp_iso', 'viaturas', '00000000-0000-0000-0000-0000087a1101', 'manual', now() - interval '1 minute');

select public.process_domain_events();

drop trigger trg_veneno_regra on public.automation_runs;

select is(
  (select count(*)::int from public.automation_runs
    where trigger_event_id = '00000000-0000-0000-0000-00000e0a1102'
      and rule_id in ('00000000-0000-0000-0000-0000004a11a1', '00000000-0000-0000-0000-0000004a11c1')),
  2,
  'as regras A e C criam os seus runs apesar de B rebentar'
);

select is(
  (select status from public.domain_events where id = '00000000-0000-0000-0000-00000e0a1102'),
  'completed',
  'o evento conclui — uma regra partida não consome as suas tentativas'
);

select ok(
  (select detalhe->>'erro' from public.automation_logs
    where rule_id = '00000000-0000-0000-0000-0000004a11b1' and evento = 'regra_falhou')
    like '%veneno de teste%',
  'a falha da regra fica registada com o erro, não engolida em silêncio'
);

select * from finish();
rollback;
