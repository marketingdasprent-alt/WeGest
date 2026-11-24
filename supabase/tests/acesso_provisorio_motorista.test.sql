-- ============================================================
-- Acesso provisório do motorista à app: pgTAP
-- ============================================================
-- Corre com:  supabase db start  &&  supabase test db
--
-- Ver a migração 20261125100000. Cobre:
--   (1) o recurso motoristas_acesso_app existe e o Administrador tem-no;
--   (2) privilégios: anon/authenticated e as funções de service_role;
--   (3) registar_acesso_provisorio, reclamar expirados e libertar;
--   (4) motorista_estado_acesso: isolamento por org, permissão e os 5 estados;
--   (5) a tabela não é legível nem escrevível por authenticated;
--   (6) marcar_senha_provisoria_trocada só marca quando o hash mudou, e só
--       nas linhas de quem chama;
--   (7) uma única senha provisória viva por conta.
-- Nada depende do dia da semana; os tempos são relativos a now().
-- ============================================================

begin;
select plan(43);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000a5c00ff', 'bootstrap@acesso-prov.pt'),
  ('00000000-0000-0000-0000-00000a5c0001', 'staff-a@acesso-prov.pt'),
  ('00000000-0000-0000-0000-00000a5c0002', 'staff-b@acesso-prov.pt'),
  ('00000000-0000-0000-0000-00000a5c0003', 'sem-perm@acesso-prov.pt'),
  ('00000000-0000-0000-0000-00000a5c0011', 'm-nunca@acesso-prov.pt'),
  ('00000000-0000-0000-0000-00000a5c0012', 'm-ativo@acesso-prov.pt'),
  ('00000000-0000-0000-0000-00000a5c0013', 'm-pendente@acesso-prov.pt'),
  ('00000000-0000-0000-0000-00000a5c0014', 'm-expirada@acesso-prov.pt'),
  ('00000000-0000-0000-0000-00000a5c0015', 'm-trocada@acesso-prov.pt'),
  ('00000000-0000-0000-0000-00000a5c0016', 'm-registar@acesso-prov.pt'),
  ('00000000-0000-0000-0000-00000a5c0017', 'm-cron@acesso-prov.pt'),
  ('00000000-0000-0000-0000-00000a5c0018', 'm-cron2@acesso-prov.pt');

-- Organizações depois do bootstrap: criar uma já semeia os grupos de base.
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-00000a5c0000', 'Org Acesso A', 'acesso-prov-a'),
  ('00000000-0000-0000-0000-00000a5c0009', 'Org Acesso B', 'acesso-prov-b');

-- handle_new_user_org pode ter metido estes utilizadores noutra org: vence este teste.
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-00000a5c0001', '00000000-0000-0000-0000-00000a5c0000'),
  ('00000000-0000-0000-0000-00000a5c0002', '00000000-0000-0000-0000-00000a5c0009'),
  ('00000000-0000-0000-0000-00000a5c0003', '00000000-0000-0000-0000-00000a5c0000'),
  ('00000000-0000-0000-0000-00000a5c0012', '00000000-0000-0000-0000-00000a5c0000'),
  ('00000000-0000-0000-0000-00000a5c0013', '00000000-0000-0000-0000-00000a5c0000'),
  ('00000000-0000-0000-0000-00000a5c0014', '00000000-0000-0000-0000-00000a5c0000')
on conflict (user_id) do update set org_id = excluded.org_id;

insert into public.cargos (id, nome, org_id) values
  ('00000000-0000-0000-0000-000000ca5c01', 'Staff acesso A', '00000000-0000-0000-0000-00000a5c0000'),
  ('00000000-0000-0000-0000-000000ca5c02', 'Staff acesso B', '00000000-0000-0000-0000-00000a5c0009'),
  ('00000000-0000-0000-0000-000000ca5c03', 'Sem permissao', '00000000-0000-0000-0000-00000a5c0000');

insert into public.user_organizacoes (user_id, org_id, is_admin, cargo_id) values
  ('00000000-0000-0000-0000-00000a5c0001', '00000000-0000-0000-0000-00000a5c0000', false,
   '00000000-0000-0000-0000-000000ca5c01'),
  ('00000000-0000-0000-0000-00000a5c0002', '00000000-0000-0000-0000-00000a5c0009', false,
   '00000000-0000-0000-0000-000000ca5c02'),
  ('00000000-0000-0000-0000-00000a5c0003', '00000000-0000-0000-0000-00000a5c0000', false,
   '00000000-0000-0000-0000-000000ca5c03')
on conflict (user_id, org_id) do update
  set is_admin = excluded.is_admin, cargo_id = excluded.cargo_id;

-- O catálogo pode vir vazio no CI; garante-se motoristas_gestao.
insert into public.recursos (nome, categoria) values ('motoristas_gestao', 'motoristas')
on conflict do nothing;

-- Staff A: tem o recurso novo. Staff B (org B): também, noutra org.
-- "Sem permissao": nenhum.
insert into public.cargo_permissoes (cargo_id, recurso_id, org_id, tem_acesso, pode_editar)
select '00000000-0000-0000-0000-000000ca5c01'::uuid, r.id, '00000000-0000-0000-0000-00000a5c0000'::uuid, true, true
  from public.recursos r where r.nome = 'motoristas_acesso_app'
union all
select '00000000-0000-0000-0000-000000ca5c02'::uuid, r.id, '00000000-0000-0000-0000-00000a5c0009'::uuid, true, true
  from public.recursos r where r.nome = 'motoristas_acesso_app';

-- Fichas (todas da org A). Sem conta, e uma por estado.
insert into public.motoristas_ativos (id, nome, email, org_id, user_id) values
  ('00000000-0000-0000-0000-0000000a5c01', 'Sem conta',  'sem@acesso-prov.pt',       '00000000-0000-0000-0000-00000a5c0000', null),
  ('00000000-0000-0000-0000-0000000a5c02', 'Nunca',      'm-nunca@acesso-prov.pt',   '00000000-0000-0000-0000-00000a5c0000', '00000000-0000-0000-0000-00000a5c0011'),
  ('00000000-0000-0000-0000-0000000a5c03', 'Ativo',      'outro@acesso-prov.pt',     '00000000-0000-0000-0000-00000a5c0000', '00000000-0000-0000-0000-00000a5c0012'),
  ('00000000-0000-0000-0000-0000000a5c04', 'Pendente',   'm-pendente@acesso-prov.pt','00000000-0000-0000-0000-00000a5c0000', '00000000-0000-0000-0000-00000a5c0013'),
  ('00000000-0000-0000-0000-0000000a5c05', 'Expirada',   'm-expirada@acesso-prov.pt','00000000-0000-0000-0000-00000a5c0000', '00000000-0000-0000-0000-00000a5c0014'),
  ('00000000-0000-0000-0000-0000000a5c06', 'Trocada',    'm-trocada@acesso-prov.pt', '00000000-0000-0000-0000-00000a5c0000', '00000000-0000-0000-0000-00000a5c0015'),
  ('00000000-0000-0000-0000-0000000a5c07', 'Registar',   'm-registar@acesso-prov.pt','00000000-0000-0000-0000-00000a5c0000', '00000000-0000-0000-0000-00000a5c0016'),
  ('00000000-0000-0000-0000-0000000a5c08', 'Cron',       'm-cron@acesso-prov.pt',    '00000000-0000-0000-0000-00000a5c0000', '00000000-0000-0000-0000-00000a5c0017'),
  ('00000000-0000-0000-0000-0000000a5c09', 'Cron 2',    'm-cron2@acesso-prov.pt',   '00000000-0000-0000-0000-00000a5c0000', '00000000-0000-0000-0000-00000a5c0018');

update auth.users set last_sign_in_at = now() - interval '2 days'
 where id = '00000000-0000-0000-0000-00000a5c0012';
update auth.users set last_sign_in_at = now() - interval '1 hour'
 where id = '00000000-0000-0000-0000-00000a5c0015';
-- Entrou com a provisória (depois do envio) mas antes de o cron a rodar.
update auth.users set last_sign_in_at = now() - interval '50 hours'
 where id = '00000000-0000-0000-0000-00000a5c0014';

-- Pendente (user 13): activa, expira daqui a 24 h, digest = hash actual da conta.
-- Expirada (user 14): rodada pelo cron; o utilizador entrou depois do envio, e
--   mesmo assim o estado é provisoria_expirada.
-- Trocada (user 15): trocada há pouco.
-- Registar (user 16): linha activa que registar_acesso_provisorio vai substituir.
-- Cron (user 17): linha activa fora do prazo, hash ainda o enviado (será reclamada).
-- Cron 2 (user 18): fora do prazo mas o hash já mudou (fica trocada, nunca é rodada).
insert into public.motorista_acessos_provisorios
  (id, org_id, motorista_id, user_id, enviado_em, expira_em, trocada_em, expirada_em, senha_digest_envio)
select v.id, '00000000-0000-0000-0000-00000a5c0000', v.motorista_id, v.user_id,
       v.enviado_em, v.expira_em, v.trocada_em, v.expirada_em, v.digest
  from (values
    ('00000000-0000-0000-0000-00000ac50001'::uuid, '00000000-0000-0000-0000-0000000a5c04'::uuid,
     '00000000-0000-0000-0000-00000a5c0013'::uuid, now() - interval '48 hours',
     now() + interval '24 hours', null::timestamptz, null::timestamptz,
     encode(extensions.digest(coalesce((select encrypted_password from auth.users
       where id = '00000000-0000-0000-0000-00000a5c0013'), ''), 'sha256'), 'hex')),
    ('00000000-0000-0000-0000-00000ac50002'::uuid, '00000000-0000-0000-0000-0000000a5c05'::uuid,
     '00000000-0000-0000-0000-00000a5c0014'::uuid, now() - interval '100 hours',
     now() - interval '28 hours', null::timestamptz, now() - interval '27 hours', 'digest-antigo'),
    ('00000000-0000-0000-0000-00000ac50003'::uuid, '00000000-0000-0000-0000-0000000a5c06'::uuid,
     '00000000-0000-0000-0000-00000a5c0015'::uuid, now() - interval '5 hours',
     now() + interval '67 hours', now() - interval '1 hour', null::timestamptz, 'digest-antigo'),
    ('00000000-0000-0000-0000-00000ac50004'::uuid, '00000000-0000-0000-0000-0000000a5c07'::uuid,
     '00000000-0000-0000-0000-00000a5c0016'::uuid, now() - interval '2 hours',
     now() + interval '70 hours', null::timestamptz, null::timestamptz, 'digest-antigo'),
    ('00000000-0000-0000-0000-00000ac50005'::uuid, '00000000-0000-0000-0000-0000000a5c08'::uuid,
     '00000000-0000-0000-0000-00000a5c0017'::uuid, now() - interval '80 hours',
     now() - interval '8 hours', null::timestamptz, null::timestamptz,
     encode(extensions.digest(coalesce((select encrypted_password from auth.users
       where id = '00000000-0000-0000-0000-00000a5c0017'), ''), 'sha256'), 'hex')),
    ('00000000-0000-0000-0000-00000ac50006'::uuid, '00000000-0000-0000-0000-0000000a5c09'::uuid,
     '00000000-0000-0000-0000-00000a5c0018'::uuid, now() - interval '80 hours',
     now() - interval '8 hours', null::timestamptz, null::timestamptz, 'digest-antigo')
  ) as v(id, motorista_id, user_id, enviado_em, expira_em, trocada_em, expirada_em, digest);

-- ── (1) Recurso e seed ─────────────────────────────────────

select is(
  (select count(*)::int from public.recursos where nome = 'motoristas_acesso_app'),
  1,
  'o recurso motoristas_acesso_app existe'
);

select ok(
  exists (
    select 1
      from public.cargo_permissoes cp
      join public.cargos c on c.id = cp.cargo_id
      join public.recursos r on r.id = cp.recurso_id
     where c.org_id = '00000000-0000-0000-0000-00000a5c0000'
       and btrim(lower(c.nome)) = 'administrador'
       and r.nome = 'motoristas_acesso_app'
       and cp.tem_acesso and cp.pode_editar
  ),
  'organização nova: o Administrador nasce com motoristas_acesso_app'
);

select is(
  (select count(*)::int
     from public.cargo_permissoes cp
     join public.recursos r on r.id = cp.recurso_id
     join public.cargos c on c.id = cp.cargo_id
    where r.nome = 'motoristas_acesso_app'
      and btrim(lower(c.nome)) <> 'administrador'
      and c.id not in ('00000000-0000-0000-0000-000000ca5c01', '00000000-0000-0000-0000-000000ca5c02')),
  0,
  'o seed só deu o recurso ao Administrador (outros grupos configuram-se na UI)'
);

-- ── (2) Privilégios ────────────────────────────────────────

select ok(
  not has_function_privilege('anon', 'public.motorista_estado_acesso(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.minha_senha_provisoria()', 'execute')
  and not has_function_privilege('anon', 'public.marcar_senha_provisoria_trocada()', 'execute'),
  'anon não executa nenhuma das 3 funções do utilizador'
);

select ok(
  has_function_privilege('authenticated', 'public.motorista_estado_acesso(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.minha_senha_provisoria()', 'execute')
  and has_function_privilege('authenticated', 'public.marcar_senha_provisoria_trocada()', 'execute'),
  'authenticated executa as 3 funções do utilizador'
);

select ok(
  not has_function_privilege('authenticated', 'public.registar_acesso_provisorio(uuid, uuid, uuid, int)', 'execute')
  and not has_function_privilege('anon', 'public.registar_acesso_provisorio(uuid, uuid, uuid, int)', 'execute')
  and not has_function_privilege('authenticated', 'public.reclamar_acessos_provisorios_expirados()', 'execute')
  and not has_function_privilege('anon', 'public.reclamar_acessos_provisorios_expirados()', 'execute')
  and not has_function_privilege('authenticated', 'public.libertar_acesso_provisorio(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.libertar_acesso_provisorio(uuid)', 'execute'),
  'registar, reclamar e libertar não são executáveis por authenticated nem anon'
);

select ok(
  has_function_privilege('service_role', 'public.registar_acesso_provisorio(uuid, uuid, uuid, int)', 'execute')
  and has_function_privilege('service_role', 'public.reclamar_acessos_provisorios_expirados()', 'execute')
  and has_function_privilege('service_role', 'public.libertar_acesso_provisorio(uuid)', 'execute'),
  'service_role executa as 3 funções do servidor'
);

select ok(
  not has_table_privilege('authenticated', 'public.motorista_acessos_provisorios', 'select')
  and not has_table_privilege('authenticated', 'public.motorista_acessos_provisorios', 'insert')
  and not has_table_privilege('authenticated', 'public.motorista_acessos_provisorios', 'update')
  and not has_table_privilege('authenticated', 'public.motorista_acessos_provisorios', 'delete')
  and not has_table_privilege('anon', 'public.motorista_acessos_provisorios', 'select'),
  'authenticated e anon não têm nenhum privilégio de tabela'
);

select ok(
  not has_column_privilege('authenticated', 'public.motorista_acessos_provisorios',
                           'senha_digest_envio', 'select'),
  'o staff não lê senha_digest_envio'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.motorista_acessos_provisorios'::regclass),
  'a tabela tem RLS ativa'
);

-- ── (7) Uma só senha viva por conta (corre como dono) ──────

select throws_ok($$
  insert into public.motorista_acessos_provisorios
    (org_id, motorista_id, user_id, expira_em, senha_digest_envio)
  values ('00000000-0000-0000-0000-00000a5c0000', '00000000-0000-0000-0000-0000000a5c04',
          '00000000-0000-0000-0000-00000a5c0013', now() + interval '72 hours', 'x')
$$, '23505', null, 'índice único: segunda senha viva para a mesma conta é recusada');

select lives_ok($$
  insert into public.motorista_acessos_provisorios
    (org_id, motorista_id, user_id, expira_em, substituida_em, senha_digest_envio)
  values ('00000000-0000-0000-0000-00000a5c0000', '00000000-0000-0000-0000-0000000a5c04',
          '00000000-0000-0000-0000-00000a5c0013', now() + interval '72 hours', now(), 'x')
$$, 'o índice único ignora linhas substituídas');

-- ── (3) registar / expirados / marcar_expirado (como service_role faria) ──

select lives_ok($$
  select public.registar_acesso_provisorio(
    '00000000-0000-0000-0000-0000000a5c07',
    '00000000-0000-0000-0000-00000a5c0016',
    '00000000-0000-0000-0000-00000a5c0001', 72)
$$, 'registar_acesso_provisorio regista a senha de um motorista');

select ok(
  (select substituida_em is not null from public.motorista_acessos_provisorios
    where id = '00000000-0000-0000-0000-00000ac50004')
  and exists (
    select 1 from public.motorista_acessos_provisorios p
     where p.user_id = '00000000-0000-0000-0000-00000a5c0016'
       and p.id <> '00000000-0000-0000-0000-00000ac50004'
       and p.substituida_em is null and p.trocada_em is null and p.expirada_em is null
       and p.org_id = '00000000-0000-0000-0000-00000a5c0000'
       and p.enviado_por = '00000000-0000-0000-0000-00000a5c0001'
       and p.expira_em > now() + interval '71 hours'
       and p.senha_digest_envio = encode(extensions.digest(coalesce(
             (select u.encrypted_password from auth.users u where u.id = p.user_id), ''),
             'sha256'), 'hex')
  ),
  'registar substitui a linha viva anterior e cria a nova com org da ficha, prazo e digest'
);

select throws_ok($$
  select public.registar_acesso_provisorio(
    '00000000-0000-0000-0000-0000000a5c07',
    '00000000-0000-0000-0000-00000a5c0011',
    '00000000-0000-0000-0000-00000a5c0001', 72)
$$, 'P0001', null, 'registar recusa uma conta que não é a da ficha');

create temp table reclamadas as
  select * from public.reclamar_acessos_provisorios_expirados();

select ok(
  exists (select 1 from reclamadas
           where id = '00000000-0000-0000-0000-00000ac50005'
             and user_id = '00000000-0000-0000-0000-00000a5c0017')
  and not exists (select 1 from reclamadas
           where id in ('00000000-0000-0000-0000-00000ac50006',
                        '00000000-0000-0000-0000-00000ac50001',
                        '00000000-0000-0000-0000-00000ac50002')),
  'reclamar devolve só a linha fora do prazo com o hash ainda igual ao enviado'
);

select ok(
  (select expirada_em is not null and trocada_em is null
     from public.motorista_acessos_provisorios where id = '00000000-0000-0000-0000-00000ac50005')
  and (select trocada_em is not null and expirada_em is null
     from public.motorista_acessos_provisorios where id = '00000000-0000-0000-0000-00000ac50006'),
  'igual: fica expirada; hash mudado: fica trocada e nunca é devolvida para rodar'
);

select is(
  (select count(*)::int from public.reclamar_acessos_provisorios_expirados()
    where id in ('00000000-0000-0000-0000-00000ac50005', '00000000-0000-0000-0000-00000ac50006')),
  0, 'uma segunda corrida não reclama de novo as mesmas linhas'
);

select lives_ok($$
  select public.libertar_acesso_provisorio('00000000-0000-0000-0000-00000ac50005')
$$, 'libertar_acesso_provisorio corre');

select ok(
  (select expirada_em is null and trocada_em is null from public.motorista_acessos_provisorios
    where id = '00000000-0000-0000-0000-00000ac50005'),
  'libertar desfaz a reclamação para a próxima volta tentar de novo'
);

-- ── (4) Estados vistos pelo staff A ────────────────────────

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000a5c0001', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000a5c0001","role":"authenticated"}', true);

select is(
  (select estado from public.motorista_estado_acesso('00000000-0000-0000-0000-0000000a5c01')),
  'sem_conta', 'estado sem_conta');

select is(
  (select estado from public.motorista_estado_acesso('00000000-0000-0000-0000-0000000a5c02')),
  'nunca_entrou', 'estado nunca_entrou');

select is(
  (select estado from public.motorista_estado_acesso('00000000-0000-0000-0000-0000000a5c03')),
  'ativo', 'estado ativo');

select is(
  (select estado from public.motorista_estado_acesso('00000000-0000-0000-0000-0000000a5c04')),
  'provisoria_pendente', 'estado provisoria_pendente');

select is(
  (select estado from public.motorista_estado_acesso('00000000-0000-0000-0000-0000000a5c05')),
  'provisoria_expirada',
  'estado provisoria_expirada, mesmo que tenha entrado antes de a senha ser rodada');

select is(
  (select estado from public.motorista_estado_acesso('00000000-0000-0000-0000-0000000a5c06')),
  'ativo', 'senha trocada: o estado volta a ativo');

select ok(
  (select provisoria_expira_em is not null from public.motorista_estado_acesso('00000000-0000-0000-0000-0000000a5c04'))
  and (select provisoria_expira_em is null from public.motorista_estado_acesso('00000000-0000-0000-0000-0000000a5c03')),
  'provisoria_expira_em só vem preenchido nos estados provisórios');

select ok(
  (select email_difere from public.motorista_estado_acesso('00000000-0000-0000-0000-0000000a5c03'))
  and not (select email_difere from public.motorista_estado_acesso('00000000-0000-0000-0000-0000000a5c04')),
  'email_difere compara o email da conta com o da ficha');

select ok(
  (select ultimo_acesso is not null from public.motorista_estado_acesso('00000000-0000-0000-0000-0000000a5c03')),
  'ultimo_acesso vem de auth.users.last_sign_in_at');

-- Staff A não tem linhas próprias: não vê nem marca as dos outros.

select is(
  (select count(*)::int from public.minha_senha_provisoria()),
  0, 'quem não tem senha provisória não recebe linha');

select is(
  public.marcar_senha_provisoria_trocada(),
  false, 'marcar devolve false a quem não tem senha provisória');

-- ── Staff B (outra org) e utilizador sem permissão ─────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000a5c0002', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000a5c0002","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.motorista_estado_acesso('00000000-0000-0000-0000-0000000a5c04')),
  0, 'staff da org B não obtém nada da ficha da org A');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000a5c0003', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000a5c0003","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.motorista_estado_acesso('00000000-0000-0000-0000-0000000a5c04')),
  0, 'utilizador sem permissão não obtém nada');

-- ── (5) Tabela fechada para authenticated ──────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000a5c0001', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000a5c0001","role":"authenticated"}', true);

select throws_ok($$
  select senha_digest_envio from public.motorista_acessos_provisorios
$$, '42501', null, 'authenticated não lê a tabela (nem o digest)');

select throws_ok($$
  insert into public.motorista_acessos_provisorios
    (motorista_id, user_id, expira_em, senha_digest_envio)
  values ('00000000-0000-0000-0000-0000000a5c01', '00000000-0000-0000-0000-00000a5c0011', now(), 'x')
$$, '42501', null, 'authenticated não faz INSERT');

select throws_ok($$
  update public.motorista_acessos_provisorios set trocada_em = now()
$$, '42501', null, 'authenticated não faz UPDATE');

select throws_ok($$
  delete from public.motorista_acessos_provisorios
$$, '42501', null, 'authenticated não faz DELETE');

-- ── (6) O próprio motorista ────────────────────────────────

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000a5c0013', true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000a5c0013","role":"authenticated"}', true);

select ok(
  (select por_trocar and expira_em > now() from public.minha_senha_provisoria()),
  'o motorista com senha provisória viva vê por_trocar = true');

select is(
  public.marcar_senha_provisoria_trocada(),
  false, 'com a mesma senha, marcar devolve false');

select is(
  (select count(*)::int from public.minha_senha_provisoria()),
  1, 'com a mesma senha, a senha continua por trocar');

reset role;
update auth.users set encrypted_password = 'hash-da-senha-nova'
 where id = '00000000-0000-0000-0000-00000a5c0013';
set local role authenticated;

select is(
  public.marcar_senha_provisoria_trocada(),
  true, 'depois de o hash mudar, marcar devolve true');

select is(
  (select count(*)::int from public.minha_senha_provisoria()),
  0, 'depois de marcada, já não há senha por trocar');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

select ok(
  (select trocada_em is null from public.motorista_acessos_provisorios
    where id = '00000000-0000-0000-0000-00000ac50002')
  and (select trocada_em is not null from public.motorista_acessos_provisorios
    where id = '00000000-0000-0000-0000-00000ac50001'),
  'marcar só mexeu nas linhas de quem chamou');

select * from finish();
rollback;
