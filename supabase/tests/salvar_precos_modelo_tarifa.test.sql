-- ============================================================
-- Gravar preços por modelo de uma tarifa — salvar_precos_modelo_tarifa()
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Gravar uma tarifa apaga e reinsere todos os preços. A 2026-09-21 uma
-- gravação da Premium Ride saiu sem o preço do Astra e o contrato #16 ficou
-- sem preço sem ninguém ser avisado. As provas defendem, por ordem:
--   * tirar o preço de um modelo com contrato aberto é recusado, a menos que
--     se confirme — e a recusa não apaga nada;
--   * a função é SECURITY DEFINER: não pode mexer em tarifas de outra org,
--     nem sem a permissão de editar tarifas, nem aceitar o org_id do browser.
--
-- Corre como postgres com as claims do utilizador: a função não depende do
-- papel (é SECURITY DEFINER), só de auth.uid(). Os grants verificam-se à parte.
-- ============================================================

begin;
select plan(18);

-- Bootstrap: consome a vaga de "primeiro utilizador da instalação" para não
-- colidir com os inserts manuais de user_organizacoes/user_org_ativa abaixo.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000007a1ff', 'bootstrap@precos.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-00000007a000', 'Org Precos A', 'precos-a'),
  ('00000000-0000-0000-0000-00000007b000', 'Org Precos B', 'precos-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000007a101', 'edita@precos.pt'),
  ('00000000-0000-0000-0000-00000007a102', 'semperm@precos.pt');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-00000007a101', '00000000-0000-0000-0000-00000007a000'),
  ('00000000-0000-0000-0000-00000007a102', '00000000-0000-0000-0000-00000007a000');

insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-00000007c101', 'Gere tarifas', '00000000-0000-0000-0000-00000007a000'),
  ('00000000-0000-0000-0000-00000007c102', 'Sem tarifas', '00000000-0000-0000-0000-00000007a000');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-00000007a101', '00000000-0000-0000-0000-00000007a000', false, '00000000-0000-0000-0000-00000007c101'),
  ('00000000-0000-0000-0000-00000007a102', '00000000-0000-0000-0000-00000007a000', false, '00000000-0000-0000-0000-00000007c102');

insert into public.cargo_permissoes (cargo_id, recurso_id, org_id, tem_acesso, pode_editar)
select '00000000-0000-0000-0000-00000007c101', r.id, '00000000-0000-0000-0000-00000007a000', true, true
from public.recursos r where r.nome = 'viaturas_grupos';

-- marca/modelo entram por id: fn_sync_viatura_marca_modelo preenche o texto.
insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-00000007aa01', '00000000-0000-0000-0000-00000007a000', 'Opel'),
  ('00000000-0000-0000-0000-00000007ab01', '00000000-0000-0000-0000-00000007b000', 'Opel');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-00000007d001', '00000000-0000-0000-0000-00000007a000',
   '00000000-0000-0000-0000-00000007aa01', 'Astra'),
  ('00000000-0000-0000-0000-00000007d002', '00000000-0000-0000-0000-00000007a000',
   '00000000-0000-0000-0000-00000007aa01', 'Panda'),
  ('00000000-0000-0000-0000-00000007db01', '00000000-0000-0000-0000-00000007b000',
   '00000000-0000-0000-0000-00000007ab01', 'Corsa');

insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id) values
  ('00000000-0000-0000-0000-00000007e001', '00000000-0000-0000-0000-00000007a000', 'PR-01-AA',
   '00000000-0000-0000-0000-00000007aa01', '00000000-0000-0000-0000-00000007d001'),
  ('00000000-0000-0000-0000-00000007e002', '00000000-0000-0000-0000-00000007a000', 'PR-02-AA',
   '00000000-0000-0000-0000-00000007aa01', '00000000-0000-0000-0000-00000007d002');

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-00000007f001', '00000000-0000-0000-0000-00000007a000', 'Cliente Precos');

insert into public.renting_tarifas (id, org_id, nome, tipo) values
  ('00000000-0000-0000-0000-00000007b101', '00000000-0000-0000-0000-00000007a000', 'TVDE A', 'tvde'),
  ('00000000-0000-0000-0000-00000007b102', '00000000-0000-0000-0000-00000007a000', 'Rent A', 'renting'),
  ('00000000-0000-0000-0000-00000007bb01', '00000000-0000-0000-0000-00000007b000', 'TVDE B', 'tvde');

insert into public.renting_tarifa_precos_modelo (org_id, tarifa_id, modelo_id, preco_semana, preco_dia, preco_mes) values
  ('00000000-0000-0000-0000-00000007a000', '00000000-0000-0000-0000-00000007b101', '00000000-0000-0000-0000-00000007d001', 275, null, null),
  ('00000000-0000-0000-0000-00000007a000', '00000000-0000-0000-0000-00000007b101', '00000000-0000-0000-0000-00000007d002', 175, null, null),
  ('00000000-0000-0000-0000-00000007a000', '00000000-0000-0000-0000-00000007b102', '00000000-0000-0000-0000-00000007d002', null, 40, 900),
  ('00000000-0000-0000-0000-00000007b000', '00000000-0000-0000-0000-00000007bb01', '00000000-0000-0000-0000-00000007db01', 300, null, null);

insert into public.contratos_renting
  (id, org_id, cliente_id, viatura_id, matricula, tarifa_id, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, is_longa_duracao)
values
  -- C1: TVDE aberto com o Astra — é o contrato que ficava sem preço.
  ('00000000-0000-0000-0000-00000007c001', '00000000-0000-0000-0000-00000007a000',
   '00000000-0000-0000-0000-00000007f001', '00000000-0000-0000-0000-00000007e001', 'PR-01-AA',
   '00000000-0000-0000-0000-00000007b101', '2026-09-01T10:00:00Z', null,
   'em_curso', 'pendente', 'tvde', 23, false),
  -- C2: TVDE já fechado com o Panda — não trava nada.
  ('00000000-0000-0000-0000-00000007c002', '00000000-0000-0000-0000-00000007a000',
   '00000000-0000-0000-0000-00000007f001', '00000000-0000-0000-0000-00000007e002', 'PR-02-AA',
   '00000000-0000-0000-0000-00000007b101', '2026-08-01T10:00:00Z', '2026-08-20T10:00:00Z',
   'fechado', 'pendente', 'tvde', 23, false),
  -- C3: rent-a-car de longa duração com o Panda — lê o preço mensal.
  ('00000000-0000-0000-0000-00000007c003', '00000000-0000-0000-0000-00000007a000',
   '00000000-0000-0000-0000-00000007f001', '00000000-0000-0000-0000-00000007e002', 'PR-02-AA',
   '00000000-0000-0000-0000-00000007b102', '2026-09-01T10:00:00Z', '2027-09-01T10:00:00Z',
   'em_curso', 'pendente', 'rent_a_car', 23, true);

-- O HINT é o que o frontend usa para pedir confirmação; o pgTAP não o expõe.
create function pg_temp.hint_de(p_sql text) returns text language plpgsql as $$
declare v_hint text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_hint = pg_exception_hint;
  return v_hint;
end $$;

-- ── Assinatura e grants ────────────────────────────────────

select hasnt_function('public', 'salvar_precos_modelo_tarifa', array['uuid', 'jsonb'],
  'a assinatura antiga (sem confirmação) deixou de existir — senão ficava ambígua');

select ok(not has_function_privilege('anon', 'public.salvar_precos_modelo_tarifa(uuid, jsonb, boolean)', 'EXECUTE'),
  'anon não executa a função');

select ok(has_function_privilege('authenticated', 'public.salvar_precos_modelo_tarifa(uuid, jsonb, boolean)', 'EXECUTE'),
  'authenticated executa a função');

-- ── Utilizador com permissão, na org A ─────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000007a101', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000007a101","role":"authenticated"}', true);

-- Mudar um preço sem o tirar não trava. O org_id vem da org B de propósito.
select lives_ok(
  $$ select salvar_precos_modelo_tarifa('00000000-0000-0000-0000-00000007b101', jsonb_build_array(
       jsonb_build_object('org_id', '00000000-0000-0000-0000-00000007b000', 'modelo_id', '00000000-0000-0000-0000-00000007d001', 'preco_semana', 300),
       jsonb_build_object('org_id', '00000000-0000-0000-0000-00000007b000', 'modelo_id', '00000000-0000-0000-0000-00000007d002', 'preco_semana', 175))) $$,
  'mudar o preço de um modelo em uso grava sem pedir confirmação'
);

select is(
  (select count(*)::int from public.renting_tarifa_precos_modelo
    where tarifa_id = '00000000-0000-0000-0000-00000007b101' and org_id <> '00000000-0000-0000-0000-00000007a000'),
  0,
  'o org_id enviado pelo browser é ignorado — as linhas ficam na org da tarifa'
);

select is(
  (select preco_semana from public.renting_tarifa_precos_modelo
    where tarifa_id = '00000000-0000-0000-0000-00000007b101' and modelo_id = '00000000-0000-0000-0000-00000007d001'),
  300.00::numeric,
  'o preço novo do Astra ficou gravado'
);

select lives_ok(
  $$ select salvar_precos_modelo_tarifa('00000000-0000-0000-0000-00000007b101', jsonb_build_array(
       jsonb_build_object('modelo_id', '00000000-0000-0000-0000-00000007d001', 'preco_semana', 300))) $$,
  'tirar o preço do Panda, só usado num contrato fechado, não pede confirmação'
);

select throws_like(
  $$ select salvar_precos_modelo_tarifa('00000000-0000-0000-0000-00000007b101', '[]'::jsonb) $$,
  '%Astra — contrato #% (PR-01-AA)%',
  'tirar o preço do Astra, com o contrato C1 aberto, é recusado e diz qual contrato'
);

select is(
  pg_temp.hint_de($$ select salvar_precos_modelo_tarifa('00000000-0000-0000-0000-00000007b101', '[]'::jsonb) $$),
  'confirmar_remocao_precos',
  'a recusa traz o HINT que o formulário usa para pedir confirmação'
);

select is(
  (select count(*)::int from public.renting_tarifa_precos_modelo
    where tarifa_id = '00000000-0000-0000-0000-00000007b101' and modelo_id = '00000000-0000-0000-0000-00000007d001'),
  1,
  'a recusa não apagou nada'
);

select lives_ok(
  $$ select salvar_precos_modelo_tarifa('00000000-0000-0000-0000-00000007b101', '[]'::jsonb, true) $$,
  'com confirmação, tirar o preço em uso grava'
);

select is(
  (select count(*)::int from public.renting_tarifa_precos_modelo
    where tarifa_id = '00000000-0000-0000-0000-00000007b101'),
  0,
  'e o preço saiu mesmo'
);

select throws_like(
  $$ select salvar_precos_modelo_tarifa('00000000-0000-0000-0000-00000007b102', jsonb_build_array(
       jsonb_build_object('modelo_id', '00000000-0000-0000-0000-00000007d002', 'preco_dia', 40))) $$,
  '%Panda — contrato #%',
  'longa duração lê o preço mensal: tirá-lo é recusado mesmo mantendo a diária'
);

select throws_ok(
  $$ select salvar_precos_modelo_tarifa('00000000-0000-0000-0000-00000007bb01', '[]'::jsonb, true) $$,
  '42501', null,
  'uma tarifa de outra org é recusada, mesmo com confirmação'
);

select is(
  (select count(*)::int from public.renting_tarifa_precos_modelo
    where tarifa_id = '00000000-0000-0000-0000-00000007bb01'),
  1,
  'e os preços da outra org ficaram intactos'
);

select throws_ok(
  $$ select salvar_precos_modelo_tarifa('00000000-0000-0000-0000-00000007b101', jsonb_build_array(
       jsonb_build_object('modelo_id', '00000000-0000-0000-0000-00000007db01', 'preco_semana', 100))) $$,
  '22023', null,
  'um modelo de outra org na lista é recusado'
);

-- ── Utilizador sem a permissão de editar tarifas ───────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000007a102', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000007a102","role":"authenticated"}', true);

select throws_ok(
  $$ select salvar_precos_modelo_tarifa('00000000-0000-0000-0000-00000007b102', '[]'::jsonb, true) $$,
  '42501', null,
  'sem a permissão viaturas_grupos a gravação é recusada'
);

select is(
  (select count(*)::int from public.renting_tarifa_precos_modelo
    where tarifa_id = '00000000-0000-0000-0000-00000007b102'),
  1,
  'e não apagou nada'
);

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
