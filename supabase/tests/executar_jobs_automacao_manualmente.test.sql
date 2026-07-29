-- ============================================================
-- Botão "Correr agora" — executar_jobs_automacao_manualmente() (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Cobre: permissão (só admin/can_edit('automacoes')), rate limit (bloqueia
-- repetição imediata, liberta passado o intervalo), e que a chamada real
-- dispara mesmo o pipeline — incluindo o scan de documentos de viatura a
-- expirar (seguro/IPO), a automação mais crítica pedida.
-- ============================================================

begin;
select plan(6);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000g0000', 'Org Botao Manual', 'botao-manual-g');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000g0a01', 'admin@botao-manual-g.pt'),
  ('00000000-0000-0000-0000-0000000g0a02', 'sem-permissao@botao-manual-g.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-0000000g0a01', '00000000-0000-0000-0000-0000000g0000', true),
  ('00000000-0000-0000-0000-0000000g0a02', '00000000-0000-0000-0000-0000000g0000', false);

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000g0a01', '00000000-0000-0000-0000-0000000g0000'),
  ('00000000-0000-0000-0000-0000000g0a02', '00000000-0000-0000-0000-0000000g0000');

-- Viatura com seguro a expirar em 5 dias — prova de que o botão dispara
-- mesmo o scan de documentos de viatura (a automação mais crítica pedida).
insert into public.viaturas (id, org_id, matricula, marca, modelo, seguro_validade, is_vendida) values
  ('00000000-0000-0000-0000-000000v1e0g1', '00000000-0000-0000-0000-0000000g0000', 'GG-11-GG', 'Toyota', 'Corolla', current_date + 5, false);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000g0a02', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000g0a02","role":"authenticated"}', true);

-- 1. Utilizador sem permissão não consegue correr.
select throws_ok(
  $$ select public.executar_jobs_automacao_manualmente() $$,
  'P0001',
  'Sem permissão para correr as automações manualmente.',
  'utilizador sem admin/can_edit(automacoes) não pode correr o botão'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000g0a01', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000g0a01","role":"authenticated"}', true);

-- 2. Admin consegue correr — e o resultado confirma sucesso.
select is(
  (select public.executar_jobs_automacao_manualmente()->>'success'),
  'true',
  'admin consegue correr o botão manualmente'
);

-- 3. O scan de documentos de viatura foi mesmo disparado: a viatura com
--    seguro a expirar gerou o evento crítico pedido.
select is(
  (select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-000000v1e0g1' and event_type = 'viatura.seguro_expirando'),
  1,
  'o botão dispara o scan de seguro/IPO de viaturas a expirar'
);

-- 4. Correr imediatamente outra vez é bloqueado pelo rate limit.
select throws_ok(
  $$ select public.executar_jobs_automacao_manualmente() $$,
  'P0001',
  null,
  'repetir de imediato é bloqueado pelo rate limit'
);

reset role;

-- 5. Simula que o intervalo já passou (rebobina o relógio do lock 10 min) —
--    a chamada seguinte já não deve ser bloqueada.
update public.automacao_execucao_manual_lock
set ultima_execucao_em = now() - interval '10 minutes'
where id = true;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000g0a01', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000g0a01","role":"authenticated"}', true);

select is(
  (select public.executar_jobs_automacao_manualmente()->>'success'),
  'true',
  'passado o intervalo do rate limit, o botão volta a funcionar'
);

-- 6. E o lock regista quem correu por último.
select is(
  (select executado_por from public.automacao_execucao_manual_lock),
  '00000000-0000-0000-0000-0000000g0a01'::uuid,
  'o lock regista o admin que correu o botão por último'
);

reset role;

select * from finish();
rollback;
