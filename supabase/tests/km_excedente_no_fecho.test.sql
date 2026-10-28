-- ============================================================
-- Km excedente no fecho — lancar_km_excedente_fecho()
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- O fecho cobra os km acima de kms_incluidos, da km_saida à km_entrada, com a
-- mesma regra da renovação (limite inteiro). As provas defendem, por ordem:
--   * o cálculo e a linha de extra (total exacto com €/km de 4 casas);
--   * repetir o fecho não duplica, e "não cobrar" retira a linha;
--   * abaixo do limite, ou sem limite, não se lança nada;
--   * SECURITY DEFINER: recusa contratos de outra org e quem não tem acesso.
-- ============================================================

begin;
select plan(17);

-- Bootstrap: consome a vaga de "primeiro utilizador da instalação".
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000ea1ff', 'bootstrap@kmexc.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000ea000', 'Org Km A', 'kmexc-a'),
  ('00000000-0000-0000-0000-0000000eb000', 'Org Km B', 'kmexc-b');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000ea101', 'admin@kmexc.pt'),
  ('00000000-0000-0000-0000-0000000ea102', 'semacesso@kmexc.pt');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000ea101', '00000000-0000-0000-0000-0000000ea000'),
  ('00000000-0000-0000-0000-0000000ea102', '00000000-0000-0000-0000-0000000ea000');

insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-0000000ec102', 'Sem contratos', '00000000-0000-0000-0000-0000000ea000');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-0000000ea101', '00000000-0000-0000-0000-0000000ea000', true, null),
  ('00000000-0000-0000-0000-0000000ea102', '00000000-0000-0000-0000-0000000ea000', false, '00000000-0000-0000-0000-0000000ec102')
on conflict (user_id, org_id) do update
  set is_admin = excluded.is_admin, cargo_id = excluded.cargo_id;

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000eaa01', '00000000-0000-0000-0000-0000000ea000', 'Opel'),
  ('00000000-0000-0000-0000-0000000eab01', '00000000-0000-0000-0000-0000000eb000', 'Opel');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-0000000ed001', '00000000-0000-0000-0000-0000000ea000',
   '00000000-0000-0000-0000-0000000eaa01', 'Astra'),
  ('00000000-0000-0000-0000-0000000edb01', '00000000-0000-0000-0000-0000000eb000',
   '00000000-0000-0000-0000-0000000eab01', 'Corsa');

insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id) values
  ('00000000-0000-0000-0000-0000000ee001', '00000000-0000-0000-0000-0000000ea000', 'KM-01-AA',
   '00000000-0000-0000-0000-0000000eaa01', '00000000-0000-0000-0000-0000000ed001'),
  ('00000000-0000-0000-0000-0000000ee002', '00000000-0000-0000-0000-0000000ea000', 'KM-02-AA',
   '00000000-0000-0000-0000-0000000eaa01', '00000000-0000-0000-0000-0000000ed001'),
  ('00000000-0000-0000-0000-0000000ee003', '00000000-0000-0000-0000-0000000ea000', 'KM-03-AA',
   '00000000-0000-0000-0000-0000000eaa01', '00000000-0000-0000-0000-0000000ed001'),
  ('00000000-0000-0000-0000-0000000eeb01', '00000000-0000-0000-0000-0000000eb000', 'KM-01-BB',
   '00000000-0000-0000-0000-0000000eab01', '00000000-0000-0000-0000-0000000edb01');

insert into public.clientes (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000ef001', '00000000-0000-0000-0000-0000000ea000', 'Cliente Km A'),
  ('00000000-0000-0000-0000-0000000efb01', '00000000-0000-0000-0000-0000000eb000', 'Cliente Km B');

-- reserva_id é NOT NULL: cada contrato precisa da sua reserva.
insert into public.reservas (id, org_id, codigo, data_inicio, viatura_id, cliente_id, estado) values
  ('00000000-0000-0000-0000-0000000ec401', '00000000-0000-0000-0000-0000000ea000', 980001,
   '2026-10-01T10:00:00Z', '00000000-0000-0000-0000-0000000ee001', '00000000-0000-0000-0000-0000000ef001', 'concluida'),
  ('00000000-0000-0000-0000-0000000ec402', '00000000-0000-0000-0000-0000000ea000', 980002,
   '2026-10-01T10:00:00Z', '00000000-0000-0000-0000-0000000ee002', '00000000-0000-0000-0000-0000000ef001', 'concluida'),
  ('00000000-0000-0000-0000-0000000ec403', '00000000-0000-0000-0000-0000000ea000', 980003,
   '2026-10-01T10:00:00Z', '00000000-0000-0000-0000-0000000ee003', '00000000-0000-0000-0000-0000000ef001', 'concluida'),
  ('00000000-0000-0000-0000-0000000ec4b1', '00000000-0000-0000-0000-0000000eb000', 980004,
   '2026-10-01T10:00:00Z', '00000000-0000-0000-0000-0000000eeb01', '00000000-0000-0000-0000-0000000efb01', 'concluida');

-- created_by: a trigger de abertura cria o evento de entrega com criado_por NOT NULL.
insert into public.contratos_renting
  (id, org_id, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, is_longa_duracao,
   kms_incluidos, km_adicional_valor, km_saida, km_entrada, created_by)
values
  -- C1: 2 500 km feitos, 2 000 incluídos, 0,125 €/km → 500 km, 62,50 €.
  ('00000000-0000-0000-0000-0000000ec001', '00000000-0000-0000-0000-0000000ea000',
   '00000000-0000-0000-0000-0000000ec401', '00000000-0000-0000-0000-0000000ef001',
   '00000000-0000-0000-0000-0000000ee001', 'KM-01-AA', '2026-10-01T10:00:00Z', '2026-10-31T10:00:00Z',
   'em_curso', 'pendente', 'rent_a_car', 23, false,
   2000, 0.125, 10000, 12500, '00000000-0000-0000-0000-0000000ea101'),
  -- C2: 1 500 km feitos, abaixo do limite.
  ('00000000-0000-0000-0000-0000000ec002', '00000000-0000-0000-0000-0000000ea000',
   '00000000-0000-0000-0000-0000000ec402', '00000000-0000-0000-0000-0000000ef001',
   '00000000-0000-0000-0000-0000000ee002', 'KM-02-AA', '2026-10-01T10:00:00Z', '2026-10-31T10:00:00Z',
   'em_curso', 'pendente', 'rent_a_car', 23, false,
   2000, 0.125, 10000, 11500, '00000000-0000-0000-0000-0000000ea101'),
  -- C3: km ilimitados (kms_incluidos NULL).
  ('00000000-0000-0000-0000-0000000ec003', '00000000-0000-0000-0000-0000000ea000',
   '00000000-0000-0000-0000-0000000ec403', '00000000-0000-0000-0000-0000000ef001',
   '00000000-0000-0000-0000-0000000ee003', 'KM-03-AA', '2026-10-01T10:00:00Z', '2026-10-31T10:00:00Z',
   'em_curso', 'pendente', 'rent_a_car', 23, false,
   null, 0.125, 10000, 19000, '00000000-0000-0000-0000-0000000ea101'),
  -- CB: outra org, com excedente.
  ('00000000-0000-0000-0000-0000000ec0b1', '00000000-0000-0000-0000-0000000eb000',
   '00000000-0000-0000-0000-0000000ec4b1', '00000000-0000-0000-0000-0000000efb01',
   '00000000-0000-0000-0000-0000000eeb01', 'KM-01-BB', '2026-10-01T10:00:00Z', '2026-10-31T10:00:00Z',
   'em_curso', 'pendente', 'rent_a_car', 23, false,
   2000, 0.125, 10000, 12500, '00000000-0000-0000-0000-0000000ea101');

-- ── Grants ─────────────────────────────────────────────────

select ok(not has_function_privilege('anon', 'public.lancar_km_excedente_fecho(uuid, boolean)', 'EXECUTE'),
  'anon não executa a função');

select ok(has_function_privilege('authenticated', 'public.lancar_km_excedente_fecho(uuid, boolean)', 'EXECUTE'),
  'authenticated executa a função');

-- ── Administrador da org A ─────────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ea101', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000ea101","role":"authenticated"}', true);

select is(
  public.lancar_km_excedente_fecho('00000000-0000-0000-0000-0000000ec001'),
  '{"km_percorridos": 2500, "km_excedente": 500, "valor": 62.50}'::jsonb,
  '500 km acima dos 2 000 incluídos, a 0,125 €/km, dão 62,50 €'
);

select results_eq(
  $$ select extra_nome, preco_unidade, quantidade, total from public.contrato_extras
      where contrato_id = '00000000-0000-0000-0000-0000000ec001' $$,
  $$ values ('Km excedente no fecho (500 km × 0.125 €)'::text, 62.50::numeric, 1, 62.50::numeric) $$,
  'fica uma linha de extra com o total exacto no preço'
);

select is(
  (select ativo from public.renting_extras
    where org_id = '00000000-0000-0000-0000-0000000ea000' and nome = 'Km excedente'),
  false,
  'o extra de catálogo nasce inactivo — fora do catálogo da API pública'
);

select is(
  (select total_extras from (
     select sum(ce.preco_unidade * ce.quantidade) as total_extras from public.contrato_extras ce
      where ce.contrato_id = '00000000-0000-0000-0000-0000000ec001') t),
  62.50::numeric,
  'preço × quantidade (o que a vista dos totais soma) bate com o total'
);

select lives_ok(
  $$ select public.lancar_km_excedente_fecho('00000000-0000-0000-0000-0000000ec001') $$,
  'repetir o fecho não rebenta'
);

select is(
  (select count(*)::int from public.contrato_extras
    where contrato_id = '00000000-0000-0000-0000-0000000ec001'),
  1,
  'e não duplica a linha'
);

select is(
  (select count(*)::int from public.renting_extras
    where org_id = '00000000-0000-0000-0000-0000000ea000' and nome = 'Km excedente'),
  1,
  'reaproveita o extra de catálogo em vez de criar outro'
);

select is(
  public.lancar_km_excedente_fecho('00000000-0000-0000-0000-0000000ec001', false),
  '{"km_percorridos": 2500, "km_excedente": 0, "valor": 0}'::jsonb,
  'com "não cobrar" o valor é zero'
);

select is(
  (select count(*)::int from public.contrato_extras
    where contrato_id = '00000000-0000-0000-0000-0000000ec001'),
  0,
  'e a linha de uma tentativa anterior sai'
);

select is(
  public.lancar_km_excedente_fecho('00000000-0000-0000-0000-0000000ec002'),
  '{"km_percorridos": 1500, "km_excedente": 0, "valor": 0}'::jsonb,
  'abaixo do limite não se cobra nada'
);

select is(
  public.lancar_km_excedente_fecho('00000000-0000-0000-0000-0000000ec003') ->> 'valor',
  '0',
  'com km ilimitados não se cobra nada'
);

select is(
  (select count(*)::int from public.contrato_extras
    where contrato_id in ('00000000-0000-0000-0000-0000000ec002', '00000000-0000-0000-0000-0000000ec003')),
  0,
  'e nenhum desses ganhou linha de extra'
);

select throws_ok(
  $$ select public.lancar_km_excedente_fecho('00000000-0000-0000-0000-0000000ec0b1') $$,
  '42501', null,
  'um contrato de outra org é recusado'
);

-- ── Utilizador sem acesso a contratos ──────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000ea102', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000ea102","role":"authenticated"}', true);

select throws_ok(
  $$ select public.lancar_km_excedente_fecho('00000000-0000-0000-0000-0000000ec001') $$,
  '42501', null,
  'sem a permissão renting_contratos é recusado'
);

select is(
  (select count(*)::int from public.contrato_extras
    where contrato_id = '00000000-0000-0000-0000-0000000ec0b1'),
  0,
  'o contrato da outra org ficou intacto'
);

select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
