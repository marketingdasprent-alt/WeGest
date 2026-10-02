-- ============================================================
-- Uma pessoa pode ter vários grupos: pgTAP
-- ============================================================
-- Corre com:  supabase db start  &&  supabase test db
--
-- Ver a migração 20261002110000. O grupo principal continua em
-- user_organizacoes.cargo_id; os adicionais em user_organizacoes_cargos.
--   (1) as permissões somam-se; quem só tem um grupo não muda;
--   (2) um grupo de administrador torna admin, e tirá-lo desfaz;
--   (3) as regras que olham para o NOME do grupo (Gestor TVDE) reconhecem
--       um grupo adicional, incluindo a regra de acesso às notificações;
--   (4) os destinatários por grupo (gestores TVDE) também;
--   (5) o grupo adicional tem de ser da mesma organização, e juntar o
--       principal não faz nada; passar um adicional a principal arruma-o;
--   (6) as funções de apoio não ficam abertas à API.
-- ============================================================

begin;
select plan(17);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000004e00ff', 'bootstrap@varios-grupos.pt'),
  ('00000000-0000-0000-0000-0000004e0001', 'u@varios-grupos.pt'),
  ('00000000-0000-0000-0000-0000004e0002', 'v@varios-grupos.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000004e0000', 'Org Varios Grupos', 'varios-grupos-a'),
  ('00000000-0000-0000-0000-0000004e0009', 'Outra Org', 'varios-grupos-b');

-- handle_new_user_org pode ter metido estes utilizadores noutra organização:
-- os on conflict garantem que os valores DESTE teste vencem.
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-0000004e0001', '00000000-0000-0000-0000-0000004e0000'),
  ('00000000-0000-0000-0000-0000004e0002', '00000000-0000-0000-0000-0000004e0000')
on conflict (user_id) do update set org_id = excluded.org_id;

-- Criar a organização já cria os grupos de base (Gestor TVDE...): tira-se o que
-- este teste vai criar com o seu próprio id.
delete from public.cargos
 where org_id = '00000000-0000-0000-0000-0000004e0000' and nome = 'Gestor TVDE';

insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-000000ce0a01', 'Grupo A teste', '00000000-0000-0000-0000-0000004e0000'),
  ('00000000-0000-0000-0000-000000ce0a02', 'Gestor TVDE', '00000000-0000-0000-0000-0000004e0000'),
  ('00000000-0000-0000-0000-000000ce0a03', 'Grupo Admin Teste', '00000000-0000-0000-0000-0000004e0000'),
  ('00000000-0000-0000-0000-000000ce0a09', 'Grupo de outra org', '00000000-0000-0000-0000-0000004e0009');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-0000004e0001', '00000000-0000-0000-0000-0000004e0000', false,
   '00000000-0000-0000-0000-000000ce0a01'),
  ('00000000-0000-0000-0000-0000004e0002', '00000000-0000-0000-0000-0000004e0000', false,
   '00000000-0000-0000-0000-000000ce0a01')
on conflict (user_id, org_id) do update
  set is_admin = excluded.is_admin, cargo_id = excluded.cargo_id;

-- A (principal): edita 'automacoes'. B (Gestor TVDE, adicional): só vê 'viaturas_ver'.
insert into public.cargo_permissoes (cargo_id, recurso_id, org_id, tem_acesso, pode_editar)
select '00000000-0000-0000-0000-000000ce0a01', r.id, '00000000-0000-0000-0000-0000004e0000', true, true
  from public.recursos r where r.nome = 'automacoes'
union all
select '00000000-0000-0000-0000-000000ce0a02', r.id, '00000000-0000-0000-0000-0000004e0000', true, false
  from public.recursos r where r.nome = 'viaturas_ver';

-- U tem o grupo adicional Gestor TVDE; V só tem o principal.
insert into public.user_organizacoes_cargos (org_id, user_id, cargo_id) values
  ('00000000-0000-0000-0000-0000004e0000', '00000000-0000-0000-0000-0000004e0001',
   '00000000-0000-0000-0000-000000ce0a02');

update public.profiles set nome = 'Pessoa U'
 where id = '00000000-0000-0000-0000-0000004e0001';

-- Sessão do U (as funções são security definer: não precisam de mudar de papel).
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000004e0001', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000004e0001","role":"authenticated"}', true);

-- ── (1) Permissões ─────────────────────────────────────────

select ok(
  public.has_permission('00000000-0000-0000-0000-0000004e0001', 'automacoes'),
  'permissão do grupo principal'
);

select ok(
  public.has_permission('00000000-0000-0000-0000-0000004e0001', 'viaturas_ver'),
  'permissão do grupo adicional: soma-se à do principal'
);

select ok(
  not public.has_permission('00000000-0000-0000-0000-0000004e0002', 'viaturas_ver'),
  'quem só tem o principal não ganha nada'
);

select ok(
  public.has_permission('00000000-0000-0000-0000-0000004e0001', 'viaturas_ver', 'ver')
  and not public.has_permission('00000000-0000-0000-0000-0000004e0001', 'viaturas_ver', 'editar'),
  'a ação "editar" respeita o pode_editar do grupo que dá o acesso'
);

select ok(
  public.has_permission_edit('00000000-0000-0000-0000-0000004e0001', 'automacoes')
  and not public.has_permission_edit('00000000-0000-0000-0000-0000004e0001', 'viaturas_ver'),
  'has_permission_edit: edita o que um grupo deixa editar, não o que só deixa ver'
);

select ok(
  public.can_edit('00000000-0000-0000-0000-0000004e0001', 'automacoes')
  and not public.can_edit('00000000-0000-0000-0000-0000004e0001', 'viaturas_ver'),
  'can_edit: mesma regra'
);

-- ── (3) Regras por nome do grupo ───────────────────────────

select ok(
  public.current_user_tem_cargo(array['Gestor TVDE']),
  'o grupo adicional Gestor TVDE é reconhecido pelo nome'
);

insert into public.notificacoes (org_id, tipo, titulo, mensagem, severidade)
values ('00000000-0000-0000-0000-0000004e0000', 'motorista_pendente', 'Teste', 'Teste', 'normal');

set local role authenticated;

select is(
  (select count(*)::int from public.notificacoes where tipo = 'motorista_pendente'),
  1,
  'a regra das notificações deixa o Gestor TVDE adicional ver as de motoristas pendentes'
);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000004e0002', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000004e0002","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.notificacoes where tipo = 'motorista_pendente'),
  0,
  'e quem não é Gestor TVDE continua a não as ver'
);

select ok(
  not public.current_user_tem_cargo(array['Gestor TVDE']),
  'quem só tem o principal não é reconhecido como Gestor TVDE'
);

reset role;

-- ── (4) Destinatários por grupo ────────────────────────────

select is(
  (select count(*)::int from public.get_gestores_tvde()
    where id = '00000000-0000-0000-0000-0000004e0001'),
  1,
  'get_gestores_tvde inclui quem tem Gestor TVDE como grupo adicional'
);

-- ── (2) Administrador ──────────────────────────────────────

insert into public.user_organizacoes_cargos (org_id, user_id, cargo_id) values
  ('00000000-0000-0000-0000-0000004e0000', '00000000-0000-0000-0000-0000004e0001',
   '00000000-0000-0000-0000-000000ce0a03');

select is(
  (select is_admin from public.user_organizacoes
    where user_id = '00000000-0000-0000-0000-0000004e0001'
      and org_id = '00000000-0000-0000-0000-0000004e0000'),
  true,
  'um grupo adicional de administrador torna a pessoa admin'
);

delete from public.user_organizacoes_cargos
 where user_id = '00000000-0000-0000-0000-0000004e0001'
   and cargo_id = '00000000-0000-0000-0000-000000ce0a03';

select is(
  (select is_admin from public.user_organizacoes
    where user_id = '00000000-0000-0000-0000-0000004e0001'
      and org_id = '00000000-0000-0000-0000-0000004e0000'),
  false,
  'tirar o último grupo de administrador desfaz'
);

-- ── (5) Regras do grupo adicional ──────────────────────────

select throws_ok(
  $$insert into public.user_organizacoes_cargos (org_id, user_id, cargo_id)
    values ('00000000-0000-0000-0000-0000004e0000', '00000000-0000-0000-0000-0000004e0001',
            '00000000-0000-0000-0000-000000ce0a09')$$,
  '23514',
  'O grupo não pertence a esta organização.',
  'um grupo de outra organização é recusado'
);

insert into public.user_organizacoes_cargos (org_id, user_id, cargo_id) values
  ('00000000-0000-0000-0000-0000004e0000', '00000000-0000-0000-0000-0000004e0002',
   '00000000-0000-0000-0000-000000ce0a01');

select is(
  (select count(*)::int from public.user_organizacoes_cargos
    where user_id = '00000000-0000-0000-0000-0000004e0002'
      and cargo_id = '00000000-0000-0000-0000-000000ce0a01'),
  0,
  'juntar o que já é o grupo principal não faz nada'
);

update public.user_organizacoes set cargo_id = '00000000-0000-0000-0000-000000ce0a02'
 where user_id = '00000000-0000-0000-0000-0000004e0001'
   and org_id = '00000000-0000-0000-0000-0000004e0000';

select is(
  (select count(*)::int from public.user_organizacoes_cargos
    where user_id = '00000000-0000-0000-0000-0000004e0001'
      and cargo_id = '00000000-0000-0000-0000-000000ce0a02'),
  0,
  'um grupo adicional que passa a principal deixa de ser adicional'
);

-- ── (6) Privilégios ────────────────────────────────────────

select ok(
  not has_function_privilege('authenticated', 'public.cargo_ids_do_utilizador(uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.cargo_ids_do_utilizador(uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.utilizador_tem_cargo(uuid, uuid, text[])', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.current_user_tem_cargo(text[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.current_user_tem_cargo(text[])', 'EXECUTE'),
  'só current_user_tem_cargo está aberta a quem tem sessão; as outras são internas'
);

select * from finish();
rollback;
