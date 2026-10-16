-- ============================================================
-- Buckets internos só para colaboradores (20261016120000)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Em produção os buckets documentos, contrato-media, documentos-suplementares,
-- viatura-danos e assistencia-anexos deixavam entrar qualquer sessão. As
-- políticas abertas só existem em produção (o baseline não tem storage), por
-- isso o teste cria uma política permissiva equivalente e prova que a
-- restritiva nova fecha a porta a contas sem organização e a motoristas.
-- Também prova que o motorista só aponta para ficheiros da sua pasta.
-- ============================================================

begin;
select plan(15);

-- Bootstrap: consome a vaga de "primeiro utilizador da instalação".
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000c00ff', 'bootstrap@internos.test');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-4000-8000-0000000c0001', 'Org Internos', 'internos-a');

-- Cargo Motorista global (uma linha partilhada por todas as orgs).
insert into public.cargos (id, nome, org_id) values
  ('a0000000-0000-0000-0000-000000000001', 'Motorista', '00000000-0000-4000-8000-0000000c0001')
on conflict (id) do nothing;

-- colab: colaborador com organização; semorg: sem organização nenhuma;
-- motorista: tem organização e o cargo Motorista, mas o perfil é de motorista.
insert into auth.users (id, email, raw_app_meta_data) values
  ('00000000-0000-4000-8000-0000000c0011', 'colab@internos.test',
   '{"org_id": "00000000-0000-4000-8000-0000000c0001"}'::jsonb);
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000c0012', 'semorg@internos.test');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000c0013', 'motorista@internos.test',
   '{"tipo_utilizador": "motorista", "org_id": "00000000-0000-4000-8000-0000000c0001"}'::jsonb),
  ('00000000-0000-4000-8000-0000000c0014', 'outro@internos.test',
   '{"tipo_utilizador": "motorista", "org_id": "00000000-0000-4000-8000-0000000c0001"}'::jsonb);

insert into public.motoristas_ativos (id, org_id, nome, user_id) values
  ('00000000-0000-4000-8000-0000000c0021', '00000000-0000-4000-8000-0000000c0001', 'Motorista Um', '00000000-0000-4000-8000-0000000c0013'),
  ('00000000-0000-4000-8000-0000000c0022', '00000000-0000-4000-8000-0000000c0001', 'Motorista Dois', '00000000-0000-4000-8000-0000000c0014');

-- O aviso "documento por aprovar" tem FK para notificacao_tipos e nenhuma migração
-- semeia o tipo (em produção foi posto à mão): sem isto o insert abaixo morre no CI.
insert into public.notificacao_tipos (tipo, descricao)
values ('motorista_documento_pendente', 'Documento de motorista por aprovar')
on conflict (tipo) do nothing;

-- O storage recente recusa DELETE directo fora da API (protect_delete).
select set_config('storage.allow_delete_query', 'true', false);

insert into storage.buckets (id, name, public) values
  ('documentos', 'documentos', false),
  ('contrato-media', 'contrato-media', false),
  ('viatura-danos', 'viatura-danos', true),
  ('assistencia-anexos', 'assistencia-anexos', true),
  ('motorista-documentos', 'motorista-documentos', false)
on conflict (id) do nothing;

-- Equivalente da política aberta de produção: qualquer sessão entra.
create policy teste_aberto_a_qualquer_sessao on storage.objects
  for all to authenticated
  using (bucket_id in ('documentos', 'contrato-media', 'viatura-danos', 'assistencia-anexos', 'motorista-documentos'))
  with check (bucket_id in ('documentos', 'contrato-media', 'viatura-danos', 'assistencia-anexos', 'motorista-documentos'));

insert into storage.objects (bucket_id, name, owner_id) values
  ('documentos', 'contrato-x/assinado.pdf', null),
  ('contrato-media', 'contrato-x/checkout/foto.jpg', null),
  ('motorista-documentos', '00000000-0000-4000-8000-0000000c0013/cartas/1.jpeg', null);

-- ── colaborador com organização: tudo como antes ────────────
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000c0011', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000c0011","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'documentos'), 1,
  'o colaborador continua a ver os contratos assinados');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('viatura-danos', 'entrega/foto.jpg', '00000000-0000-4000-8000-0000000c0011') $$,
  'o colaborador continua a carregar fotos de danos');
reset role;

-- ── conta sem organização (cliente do site, registo sem metadata) ──
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000c0012', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000c0012","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'documentos'), 0,
  'conta sem organização já não vê os contratos assinados');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('viatura-danos', 'lixo/foto.jpg', '00000000-0000-4000-8000-0000000c0012') $$,
  '42501', null, 'conta sem organização já não carrega nos buckets internos');
delete from storage.objects where bucket_id = 'contrato-media';
reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'contrato-media'), 1,
  'conta sem organização já não apaga as fotos de vistoria');

-- ── motorista: tem organização, mas não é colaborador ───────
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000c0013', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000c0013","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from storage.objects where bucket_id = 'documentos'), 0,
  'o motorista não vê os contratos da empresa');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner_id)
     values ('assistencia-anexos', 'x/foto.jpg', '00000000-0000-4000-8000-0000000c0013') $$,
  '42501', null, 'o motorista não carrega nos buckets internos');
select is((select count(*)::int from storage.objects where bucket_id = 'motorista-documentos'), 1,
  'o motorista continua a ver os seus documentos (bucket fora da lista)');

-- ── documentos do motorista: só a sua pasta ─────────────────
select lives_ok(
  $$ insert into public.motorista_documentos (motorista_id, tipo_documento, ficheiro_url, status)
     values ('00000000-0000-4000-8000-0000000c0021', 'carta',
             '00000000-0000-4000-8000-0000000c0013/cartas/1.jpeg', 'pendente') $$,
  'o motorista regista um documento na pasta com o id da sua conta');
select lives_ok(
  $$ insert into public.motorista_documentos (motorista_id, tipo_documento, ficheiro_url, status)
     values ('00000000-0000-4000-8000-0000000c0021', 'cc',
             '00000000-0000-4000-8000-0000000c0021/cc/1.jpeg', 'pendente') $$,
  'ou na pasta com o id do seu motorista');
select throws_ok(
  $$ insert into public.motorista_documentos (motorista_id, tipo_documento, ficheiro_url, status)
     values ('00000000-0000-4000-8000-0000000c0021', 'carta',
             '00000000-0000-4000-8000-0000000c0014/cartas/1.jpeg', 'pendente') $$,
  '42501', null, 'mas não aponta para o ficheiro de outro motorista');
select throws_ok(
  $$ update public.motorista_documentos
        set ficheiro_url = '00000000-0000-4000-8000-0000000c0014/cartas/1.jpeg'
      where motorista_id = '00000000-0000-4000-8000-0000000c0021' and tipo_documento = 'carta' $$,
  '42501', null, 'nem muda depois um dos seus para o ficheiro de outro');
reset role;

select lives_ok(
  $$ insert into public.motorista_documentos (motorista_id, tipo_documento, ficheiro_url, status)
     values ('00000000-0000-4000-8000-0000000c0022', 'carta',
             'importado/qualquer/1.pdf', 'aprovado') $$,
  'o servidor (e a equipa) continuam a registar qualquer caminho');

-- ── privilégios ─────────────────────────────────────────────
select ok(
  not has_function_privilege('anon', 'public.e_colaborador_com_organizacao()', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.e_colaborador_com_organizacao()', 'EXECUTE'),
  'a função da política executa-se com sessão e nunca sem ela');
select ok(
  not has_function_privilege('authenticated', 'public.motorista_documentos_so_a_sua_pasta()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.motorista_documentos_so_a_sua_pasta()', 'EXECUTE'),
  'a função do trigger não é chamável directamente');

select * from finish();
rollback;
