-- ============================================================
-- "Deteção de tentativas de login suspeitas" (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Item 13/13 (último) da lista do chefe. Login é 100% client-side
-- (src/pages/Login.tsx via supabase.auth.signInWithPassword), sem
-- nenhum rasto de tentativas até agora. Este item cria login_attempts
-- (preenchida pelo próprio login form) e um scan de alta frequência
-- (5 em 5 min) que deteta 5+ tentativas falhadas para o mesmo email
-- em 15 minutos, notificando só os Administradores da organização
-- visada pelo código introduzido no login.
-- ============================================================

begin;
select plan(5);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000170000', 'Org Login L', 'lgn-l0');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000170001', 'admin@lgn-l0.pt');

insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-000000170001', '00000000-0000-0000-0000-000000170000', true);

-- Caso A: 5 tentativas falhadas para o mesmo email em 15 minutos — deve disparar.
insert into public.login_attempts (email, org_codigo, success, created_at)
select 'atacante@teste.pt', 'lgn-l0', false, now() - (n || ' minutes')::interval
from generate_series(1, 5) n;

-- Caso B: apenas 4 tentativas — não deve disparar.
insert into public.login_attempts (email, org_codigo, success, created_at)
select 'quase@teste.pt', 'lgn-l0', false, now() - (n || ' minutes')::interval
from generate_series(1, 4) n;

-- Caso C: 5 tentativas mas para um código de organização que não existe — não deve disparar.
insert into public.login_attempts (email, org_codigo, success, created_at)
select 'orginvalida@teste.pt', 'org-que-nao-existe', false, now() - (n || ' minutes')::interval
from generate_series(1, 5) n;

select public.emit_login_suspeitos_events();

-- 1. 5 tentativas falhadas no mesmo email/org publica o evento.
select is(
  (select count(*)::int from public.domain_events where event_type = 'seguranca.login_suspeito' and payload->>'email' = 'atacante@teste.pt'),
  1,
  '5 tentativas falhadas em 15 min publicam seguranca.login_suspeito'
);

-- 2. Apenas 4 tentativas não dispara (abaixo do limiar).
select is(
  (select count(*)::int from public.domain_events where event_type = 'seguranca.login_suspeito' and payload->>'email' = 'quase@teste.pt'),
  0,
  '4 tentativas falhadas não atingem o limiar de 5'
);

-- 3. Código de organização inexistente não dispara (sem org para notificar).
select is(
  (select count(*)::int from public.domain_events where event_type = 'seguranca.login_suspeito' and payload->>'email' = 'orginvalida@teste.pt'),
  0,
  'código de organização inexistente não dispara o alerta'
);

select public.process_domain_events();
select public.execute_automation_runs();

-- 4. O admin da organização visada recebe a notificação.
select is(
  (select count(*)::int from public.notifications where destinatario_user_id = '00000000-0000-0000-0000-000000170001' and template_codigo = 'seguranca.login_suspeito'),
  1,
  'admin da organização visada recebe a notificação de login suspeito'
);

-- 5. Uma segunda chamada ao scan, dentro da mesma janela, não duplica o alerta.
select public.emit_login_suspeitos_events();
select is(
  (select count(*)::int from public.domain_events where event_type = 'seguranca.login_suspeito' and payload->>'email' = 'atacante@teste.pt'),
  1,
  'scan repetido dentro da mesma janela de 15 min não duplica o alerta'
);

select * from finish();
rollback;
