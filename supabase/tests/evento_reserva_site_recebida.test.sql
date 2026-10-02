-- ============================================================
-- Sino "nova reserva do site" para o Administrador (Fase C da API)
-- ============================================================
begin;
select plan(8);

select ok(exists (select 1 from public.notificacao_tipos where tipo = 'reserva_site_recebida'), 'tipo existe');
select is((select tipo_legado from public.notificacao_tipo_map where event_type = 'reserva.site_recebida'),
  'reserva_site_recebida', 'evento mapeado para o tipo');

-- Organização nova: o trigger cria o cargo Administrador e depois a regra.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000e01ff', 'bootstrap@site.pt');
insert into public.organizacoes (id, nome, codigo) values ('00000000-0000-0000-0000-0000000e0a00', 'Org Site', 'org-site');

select is((select count(*)::int from public.automation_rules where org_id = '00000000-0000-0000-0000-0000000e0a00'
            and codigo = 'reserva.site_recebida' and acao_tipo = 'notificacao' and ativo), 1, 'regra do sino semeada');
select ok((select acao_config->'destinatarios_cargo_ids' @> to_jsonb(array[(select c.id from public.cargos c
             where c.org_id = '00000000-0000-0000-0000-0000000e0a00' and c.nome = 'Administrador' limit 1)])
           from public.automation_rules where org_id = '00000000-0000-0000-0000-0000000e0a00' and codigo = 'reserva.site_recebida'),
  'destinatário: cargo Administrador');
select is((select count(*)::int from public.automation_rules where org_id = '00000000-0000-0000-0000-0000000e0a00'
            and event_type = 'reserva.site_recebida' and acao_tipo = 'email'), 0, 'sem regra de email (decisão de 02-10)');

select lives_ok($$ select public.seed_alerta_reserva_site_recebida('00000000-0000-0000-0000-0000000e0a00') $$,
  'seed corre outra vez sem erro');
select is((select count(*)::int from public.automation_rules where org_id = '00000000-0000-0000-0000-0000000e0a00'
            and codigo = 'reserva.site_recebida'), 1, 'seed repetido não duplica');

select ok(not has_function_privilege('authenticated', 'public.seed_alerta_reserva_site_recebida(uuid)', 'execute'),
  'authenticated não corre o seed');

select * from finish();
rollback;
