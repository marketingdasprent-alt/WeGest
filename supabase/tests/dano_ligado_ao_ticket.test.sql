-- ============================================================
-- Dano ligado ao ticket da Assistência: leitura cruzada — pgTAP
-- ============================================================
-- Ver a migração 20261023110000. Provas:
--   (a) quem vê a frota vê o ticket ligado e as mensagens dele, e não os outros;
--   (b) quem gere a Assistência vê o dano ligado (fotos e histórico), e não os outros;
--   (c) o motorista que abriu o ticket não ganha acesso ao dano, nem atribuindo-o a si;
--   (d) outra org não vê nada;
--   (e) a lista para ligar só responde a quem edita viaturas;
--   (f) um dano só se liga a ticket da mesma viatura;
--   (g) anon não executa as funções.
-- Ler os tickets como utilizador da frota prova também que as políticas não entram em recursão.
-- ============================================================

begin;
select plan(18);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f00ff', 'bootstrap@dano-ticket.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000f0a00', 'Org Dano Ticket A', 'dt-ticket-a'),
  ('00000000-0000-0000-0000-0000000f0b00', 'Org Dano Ticket B', 'dt-ticket-b');

-- 01 frota (viaturas_ver + viaturas_editar), 02 assistência (assistencia_tickets),
-- 03 motorista sem cargo (abriu o ticket), 04 admin da org B.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f0a01', 'frota@dano-ticket.pt'),
  ('00000000-0000-0000-0000-0000000f0a02', 'assist@dano-ticket.pt'),
  ('00000000-0000-0000-0000-0000000f0a03', 'motorista@dano-ticket.pt'),
  ('00000000-0000-0000-0000-0000000f0b01', 'admin-b@dano-ticket.pt');

insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0a00'),
  ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0a00'),
  ('00000000-0000-0000-0000-0000000f0a03', '00000000-0000-0000-0000-0000000f0a00'),
  ('00000000-0000-0000-0000-0000000f0b01', '00000000-0000-0000-0000-0000000f0b00')
on conflict (user_id) do update set org_id = excluded.org_id;

insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-0000000fca01', 'Frota DT', '00000000-0000-0000-0000-0000000f0a00'),
  ('00000000-0000-0000-0000-0000000fca02', 'Assistencia DT', '00000000-0000-0000-0000-0000000f0a00');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-0000000f0a01', '00000000-0000-0000-0000-0000000f0a00', false,
   '00000000-0000-0000-0000-0000000fca01'),
  ('00000000-0000-0000-0000-0000000f0a02', '00000000-0000-0000-0000-0000000f0a00', false,
   '00000000-0000-0000-0000-0000000fca02'),
  ('00000000-0000-0000-0000-0000000f0a03', '00000000-0000-0000-0000-0000000f0a00', false, null),
  ('00000000-0000-0000-0000-0000000f0b01', '00000000-0000-0000-0000-0000000f0b00', true, null)
on conflict (user_id, org_id) do update
  set is_admin = excluded.is_admin, cargo_id = excluded.cargo_id;

insert into public.cargo_permissoes (cargo_id, recurso_id, org_id, tem_acesso, pode_editar)
select '00000000-0000-0000-0000-0000000fca01', r.id, '00000000-0000-0000-0000-0000000f0a00', true, true
  from public.recursos r where r.nome in ('viaturas_ver', 'viaturas_editar');
insert into public.cargo_permissoes (cargo_id, recurso_id, org_id, tem_acesso, pode_editar)
select '00000000-0000-0000-0000-0000000fca02', r.id, '00000000-0000-0000-0000-0000000f0a00', true, true
  from public.recursos r where r.nome = 'assistencia_tickets';

insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000f0aa1', '00000000-0000-0000-0000-0000000f0a00', 'Renault');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-0000000f0ab1', '00000000-0000-0000-0000-0000000f0a00',
   '00000000-0000-0000-0000-0000000f0aa1', 'Clio');
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, status) values
  ('00000000-0000-0000-0000-0000000f0ae1', '00000000-0000-0000-0000-0000000f0a00', 'DT-01-AA',
   '00000000-0000-0000-0000-0000000f0aa1', '00000000-0000-0000-0000-0000000f0ab1', 'disponivel'),
  ('00000000-0000-0000-0000-0000000f0ae2', '00000000-0000-0000-0000-0000000f0a00', 'DT-02-AA',
   '00000000-0000-0000-0000-0000000f0aa1', '00000000-0000-0000-0000-0000000f0ab1', 'disponivel');

-- T1 ligado ao dano D1; T2 da mesma viatura sem ligação; T3 de outra viatura.
insert into public.assistencia_tickets (id, org_id, viatura_id, titulo, status, prioridade, criado_por) values
  ('00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0a00',
   '00000000-0000-0000-0000-0000000f0ae1', 'Sinistro lateral', 'aberto', 'media',
   '00000000-0000-0000-0000-0000000f0a03'),
  ('00000000-0000-0000-0000-0000000f0c02', '00000000-0000-0000-0000-0000000f0a00',
   '00000000-0000-0000-0000-0000000f0ae1', 'Revisão', 'aberto', 'baixa', null),
  ('00000000-0000-0000-0000-0000000f0c03', '00000000-0000-0000-0000-0000000f0a00',
   '00000000-0000-0000-0000-0000000f0ae2', 'Outra viatura', 'aberto', 'baixa', null);

insert into public.assistencia_mensagens (ticket_id, org_id, mensagem, tipo) values
  ('00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0a00',
   'Seguradora pediu peritagem', 'nota_interna'),
  ('00000000-0000-0000-0000-0000000f0c02', '00000000-0000-0000-0000-0000000f0a00',
   'Revisão marcada', 'mensagem');

insert into public.viatura_danos (id, org_id, viatura_id, descricao, estado, ticket_id) values
  ('00000000-0000-0000-0000-0000000f0d01', '00000000-0000-0000-0000-0000000f0a00',
   '00000000-0000-0000-0000-0000000f0ae1', 'Colisão lateral', 'existente',
   '00000000-0000-0000-0000-0000000f0c01'),
  ('00000000-0000-0000-0000-0000000f0d02', '00000000-0000-0000-0000-0000000f0a00',
   '00000000-0000-0000-0000-0000000f0ae1', 'Risco no para-choques', 'existente', null);

insert into public.viatura_dano_fotos (dano_id, org_id, ficheiro_url) values
  ('00000000-0000-0000-0000-0000000f0d01', '00000000-0000-0000-0000-0000000f0a00', 'd01/foto.jpg'),
  ('00000000-0000-0000-0000-0000000f0d02', '00000000-0000-0000-0000-0000000f0a00', 'd02/foto.jpg');

create function pg_temp.como(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;

-- ── (a) Frota ──────────────────────────────────────────────

select pg_temp.como('00000000-0000-0000-0000-0000000f0a01');
set local role authenticated;

select is(
  (select count(*)::int from public.assistencia_tickets where id = '00000000-0000-0000-0000-0000000f0c01'),
  1, '(a) a frota vê o ticket ligado ao dano'
);
select is(
  (select count(*)::int from public.assistencia_tickets where id = '00000000-0000-0000-0000-0000000f0c02'),
  0, '(a) e não vê um ticket sem dano ligado'
);
select is(
  (select count(*)::int from public.assistencia_mensagens where ticket_id = '00000000-0000-0000-0000-0000000f0c01'),
  1, '(a) vê as mensagens do ticket ligado, incluindo notas internas'
);
select is(
  (select count(*)::int from public.assistencia_mensagens where ticket_id = '00000000-0000-0000-0000-0000000f0c02'),
  0, '(a) e não as dos outros tickets'
);
select is(
  (select count(*)::int from public.tickets_da_viatura_para_ligar('00000000-0000-0000-0000-0000000f0ae1')),
  2, '(e) quem edita viaturas recebe os tickets da viatura para ligar'
);

reset role;

-- ── (b) Assistência ────────────────────────────────────────

select pg_temp.como('00000000-0000-0000-0000-0000000f0a02');
set local role authenticated;

select is(
  (select count(*)::int from public.viatura_danos where id = '00000000-0000-0000-0000-0000000f0d01'),
  1, '(b) a Assistência vê o dano ligado ao ticket'
);
select is(
  (select count(*)::int from public.viatura_danos where id = '00000000-0000-0000-0000-0000000f0d02'),
  0, '(b) e não vê um dano sem ligação'
);
select is(
  (select count(*)::int from public.viatura_dano_fotos where dano_id = '00000000-0000-0000-0000-0000000f0d01'),
  1, '(b) vê as fotos do dano ligado'
);
select is(
  (select count(*)::int from public.viatura_dano_fotos where dano_id = '00000000-0000-0000-0000-0000000f0d02'),
  0, '(b) e não as do dano sem ligação'
);
select is(
  (select count(*)::int from public.viatura_dano_historico where dano_id = '00000000-0000-0000-0000-0000000f0d01'),
  1, '(b) vê o histórico do dano ligado'
);
select is(
  (select count(*)::int from public.tickets_da_viatura_para_ligar('00000000-0000-0000-0000-0000000f0ae1')),
  0, '(e) sem viaturas_editar a lista para ligar vem vazia'
);

reset role;

-- ── (c) Motorista que abriu o ticket ───────────────────────

select pg_temp.como('00000000-0000-0000-0000-0000000f0a03');
set local role authenticated;

-- Quem abre o ticket pode editá-lo (política de criado_por), incluindo atribuí-lo a si.
update public.assistencia_tickets set atribuido_a = '00000000-0000-0000-0000-0000000f0a03'
 where id = '00000000-0000-0000-0000-0000000f0c01';

select is(
  (select atribuido_a from public.assistencia_tickets where id = '00000000-0000-0000-0000-0000000f0c01'),
  '00000000-0000-0000-0000-0000000f0a03'::uuid,
  '(c) o motorista conseguiu atribuir o ticket a si próprio'
);
select is(
  (select count(*)::int from public.viatura_danos where id = '00000000-0000-0000-0000-0000000f0d01'),
  0, '(c) e mesmo assim não vê o dano ligado'
);

reset role;

-- ── (d) Outra org ──────────────────────────────────────────

select pg_temp.como('00000000-0000-0000-0000-0000000f0b01');
set local role authenticated;

select is(
  (select count(*)::int from public.viatura_danos where id = '00000000-0000-0000-0000-0000000f0d01'),
  0, '(d) o admin da org B não vê o dano'
);
select is(
  (select count(*)::int from public.assistencia_tickets where id = '00000000-0000-0000-0000-0000000f0c01'),
  0, '(d) nem o ticket'
);

reset role;

-- ── (f) Coerência da ligação, como utilizador da frota ─────

select pg_temp.como('00000000-0000-0000-0000-0000000f0a01');
set local role authenticated;

select throws_ok(
  $$ update public.viatura_danos set ticket_id = '00000000-0000-0000-0000-0000000f0c03'
      where id = '00000000-0000-0000-0000-0000000f0d02' $$,
  '23514', null,
  '(f) ligar a um ticket de outra viatura é recusado'
);
select lives_ok(
  $$ update public.viatura_danos set ticket_id = '00000000-0000-0000-0000-0000000f0c02'
      where id = '00000000-0000-0000-0000-0000000f0d02' $$,
  '(f) ligar a um ticket da mesma viatura passa'
);

reset role;

-- ── (g) Grants ─────────────────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.danos_ligados_visiveis_pela_assistencia()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.tickets_ligados_visiveis_pela_frota()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.tickets_da_viatura_para_ligar(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.fn_viatura_dano_ticket_mesma_viatura()', 'EXECUTE'),
  '(g) anon não executa as funções e ninguém chama a do trigger'
);

select * from finish();
rollback;
