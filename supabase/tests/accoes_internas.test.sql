-- ============================================================
-- Acções internas — MVP (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- A garantia sob teste: o motor executa uma pequena tarefa interna de forma
-- segura, previsível e repetível — e não consegue ser levado a fazer mais do
-- que aquilo que o catálogo permite.
--
-- ── O QUE O `alterado` PROVA ────────────────────────────────────────────────
--
-- Cada handler devolve se alterou mesmo alguma coisa, e isso fica em
-- `automation_logs.detalhe`. É por aí que se prova a idempotência: não basta
-- «o valor final está certo» — no retry tem de vir `alterado=false`, que é o
-- que garante que nenhum trigger da tabela chegou a correr.
--
-- Um booleano e não uma contagem de linhas, de propósito: zero linhas era
-- ambíguo entre «já estava certo» e «o alvo não existe nesta organização», e a
-- segunda hipótese não pode passar por sucesso. O handler verifica a
-- existência antes, e levanta.
--
-- ── PORQUE event_types INVENTADOS ───────────────────────────────────────────
--
-- Criar uma organização semeia as regras por omissão. Com um event_type real,
-- cada evento casaria também com a regra semeada e nasceriam runs a mais.
-- ============================================================

begin;
select plan(21);

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
  ('00000000-0000-0000-0000-0000000c1100', 'Gere Automacoes', '00000000-0000-0000-0000-00000000a100');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a100', true,  null),
  ('00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-00000000a100', false, '00000000-0000-0000-0000-0000000c1100');

-- Este cargo pode gerir automações e mais nada. É o cenário que interessa
-- testar, e o único que chega ao validador: a RLS de `automation_rules` exige
-- `can_edit(user, 'automacoes')` para escrever QUALQUER regra, portanto um
-- utilizador sem permissão nenhuma era bloqueado antes — com 42501, não com o
-- 23514 da validação da acção.
--
-- O que se prova aqui é a fronteira certa: poder configurar automações não é
-- poder automatizar tudo.
insert into public.cargo_permissoes (cargo_id, recurso_id, org_id, tem_acesso, pode_editar)
select '00000000-0000-0000-0000-0000000c1100', r.id, '00000000-0000-0000-0000-00000000a100', true, true
from public.recursos r where r.nome = 'automacoes';

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-00008a4a1100', '00000000-0000-0000-0000-00000000a100', 'Seat');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-00008e4a1100', '00000000-0000-0000-0000-00000000a100',
   '00000000-0000-0000-0000-00008a4a1100', 'Leon');

insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id) values
  ('00000000-0000-0000-0000-0000087a1101', '00000000-0000-0000-0000-00000000a100', 'MV-01-PA',
   '00000000-0000-0000-0000-00008a4a1100', '00000000-0000-0000-0000-00008e4a1100');

-- A viatura da org B existe só para o teste de cross-tenant.
--
-- marca/modelo entram por id, e é obrigatório: `fn_sync_viatura_marca_modelo`
-- corre em TODO o INSERT e faz `select nome into NEW.marca ... where id =
-- NEW.marca_id`. Com `marca_id` nulo o select não encontra nada, `marca` fica
-- NULL, e a coluna é NOT NULL. Passar o texto directamente não funciona — é
-- apagado antes de chegar à tabela.
insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-00008a4b1100', '00000000-0000-0000-0000-00000000b100', 'Seat');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-00008e4b1100', '00000000-0000-0000-0000-00000000b100',
   '00000000-0000-0000-0000-00008a4b1100', 'Leon');

insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id) values
  ('00000000-0000-0000-0000-0000087b1101', '00000000-0000-0000-0000-00000000b100', 'MV-99-PB',
   '00000000-0000-0000-0000-00008a4b1100', '00000000-0000-0000-0000-00008e4b1100');

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
  (select detalhe->>'alterado' from public.automation_logs
    where run_id = '00000000-0000-0000-0000-00000c4a1101' and evento = 'executada'),
  'true',
  'a primeira execução altera mesmo o campo'
);

-- Retry: o mesmo run devolvido a pending, como o varrimento de presos faz.
update public.automation_runs
   set status = 'pending', started_at = null, next_attempt_at = now()
 where id = '00000000-0000-0000-0000-00000c4a1101';

select public.execute_automation_runs();

select is(
  (select count(*)::int from public.automation_logs
    where run_id = '00000000-0000-0000-0000-00000c4a1101' and evento = 'executada'
      and detalhe->>'alterado' = 'false'),
  1,
  'o retry conclui com alterado=false — nenhum trigger da tabela chega a correr'
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
-- O cargo tem `automacoes` — logo passa a RLS de `automation_rules` e chega ao
-- validador — mas não tem `motoristas_editar`, que é o recurso que a acção
-- declara. É aí que é recusado.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a102', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a102","role":"authenticated"}', true);

select throws_ok(
  $$insert into public.automation_rules (org_id, codigo, nome, event_type, acao_tipo, acao_config)
    values ('00000000-0000-0000-0000-00000000a100', 'teste.mvp_sem_perm', 'X', 'teste.x', 'automacao_interna',
            '{"accao":"motorista.atualizar_campo","campo":"observacoes","valor":"x"}'::jsonb)$$,
  '23514', null,
  'quem gere automações mas não pode editar motoristas não configura essa acção'
);

-- `reset role` repõe o PAPEL, mas as claims são definições de configuração
-- locais à transacção e ficam onde estavam. `auth.uid()` continuaria a devolver
-- o utilizador sem permissões, e a validação da acção aplicá-la-ia a todas as
-- escritas seguintes — foi assim que o `update` do cenário do snapshot, mais
-- abaixo, rebentou com «sem permissão tickets_gerir».
--
-- `auth.uid()` faz `nullif(..., '')` sobre as duas definições, portanto limpar
-- ambas devolve NULL e restaura o contexto de sistema.
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

-- ════════════════════════════════════════════════════════════
-- Cross-tenant: recusa, não silêncio
-- ════════════════════════════════════════════════════════════
-- Zero linhas não é resposta: significaria «o valor já estava certo» tanto
-- como «a entidade não é desta organização». O handler verifica a existência
-- antes de escrever, e levanta.
select throws_ok(
  $$select public.fn_accao_viatura_atualizar_campo(
      '00000000-0000-0000-0000-00000000a100',          -- org A
      '00000000-0000-0000-0000-0000087b1101',          -- viatura da org B
      '{"campo":"observacoes","valor":"invadido"}'::jsonb)$$,
  'P0001', null,
  'o handler RECUSA uma entidade de outra organização, mesmo com o UUID certo'
);

select is(
  (select observacoes from public.viaturas where id = '00000000-0000-0000-0000-0000087b1101'),
  null,
  'e a entidade da org B fica intacta'
);

-- ════════════════════════════════════════════════════════════
-- A acção tem de bater certo com a entidade do run
-- ════════════════════════════════════════════════════════════
-- Um entity_id é um UUID e mais nada. Sem esta verificação, uma regra de
-- motorista com uma acção de viatura passava o id do motorista ao handler de
-- viaturas.
--
-- Na escrita é recusado quando o catálogo conhece o event_type:
select throws_ok(
  $$insert into public.automation_rules (org_id, codigo, nome, event_type, acao_tipo, acao_config)
    values ('00000000-0000-0000-0000-00000000a100', 'teste.mvp_troca', 'X',
            'motorista.ficha_incompleta', 'automacao_interna',
            '{"accao":"viatura.atualizar_campo","campo":"observacoes","valor":"x"}'::jsonb)$$,
  '23514', null,
  'uma acção de viatura num evento de motorista é recusada na escrita'
);

-- E em runtime, para os event_types que o catálogo não conhece — plantada com
-- o validador desligado, que é o único caminho por onde chegaria.
alter table public.automation_rules disable trigger trg_validar_acao_config;

insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values
  ('00000000-0000-0000-0000-0000004a1106', '00000000-0000-0000-0000-00000000a100',
   'teste.mvp_troca_rt', 'MVP Troca', 'teste.mvp_troca_rt', 'automacao_interna',
   '{"accao":"viatura.atualizar_campo","campo":"observacoes","valor":"nao devia acontecer"}'::jsonb);

alter table public.automation_rules enable trigger trg_validar_acao_config;

insert into public.automation_runs (id, rule_id, org_id, entity_table, entity_id) values
  ('00000000-0000-0000-0000-00000c4a1106', '00000000-0000-0000-0000-0000004a1106',
   '00000000-0000-0000-0000-00000000a100', 'motoristas_ativos', '00000000-0000-0000-0000-0000000e1101');

select public.execute_automation_runs();

select isnt(
  (select status from public.automation_runs where id = '00000000-0000-0000-0000-00000c4a1106'),
  'completed',
  'um run de motorista com acção de viatura NÃO é dado como concluído'
);

select is(
  (select observacoes from public.viaturas where id = '00000000-0000-0000-0000-0000087a1101'),
  'Seguro a expirar',
  'e nenhuma viatura é alterada — o valor anterior mantém-se'
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
