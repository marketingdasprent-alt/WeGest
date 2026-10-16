-- ============================================================
-- Conta de cliente rent-a-car do site (20261016100000)
-- ============================================================
-- Registo 'cliente': só o profile, sem org, cargo, membership nem evento.
-- Com o email confirmado (no insert ou depois, por update) a conta liga-se à
-- ficha particular mais antiga criada pela equipa com o mesmo email na org do
-- registo, ou cria uma; só se a org tiver chave activa com conta:read. Sem
-- ficha, liga no primeiro pedido com a chave de uma org. As funções
-- api_conta_* só vêem a ficha ligada na org da chave, e as faturas só pelo
-- destinatário fiscal; api_criar_reserva com p_user_id usa essa ficha.
-- Datas relativas a now(); NIFs de teste com checksum válido.
-- ============================================================
begin;
select plan(134);

-- Bootstrap antes das organizações: consome a vaga do primeiro utilizador.
-- 0399 é a conta dona de uma ficha já ligada.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000c1e01ff', 'bootstrap@contacli.pt'),
  ('00000000-0000-0000-0000-00000c1e02ff', 'gestor@contacli.pt'),
  ('00000000-0000-0000-0000-00000c1e0399', 'outra.conta@contacli.pt');
insert into public.organizacoes (id, nome, codigo, ativa) values
  ('00000000-0000-0000-0000-00000c1e0a00', 'Org Conta Cliente A', 'contacli-a', true),
  ('00000000-0000-0000-0000-00000c1e0b00', 'Org Conta Cliente B', 'contacli-b', true),
  ('00000000-0000-0000-0000-00000c1e0c00', 'Org Conta Cliente Inactiva', 'contacli-c', false);
insert into public.cargos (id, nome, org_id) values
  ('a0000000-0000-0000-0000-000000000001', 'Motorista', '00000000-0000-0000-0000-00000c1e0a00')
on conflict (id) do nothing;

-- A org A tem site de conta. A org B tem chaves, mas nenhuma serve para contas:
-- desactivada, expirada, de outro escopo, ou sem conta:read.
insert into public.api_chaves (id, org_id, nome, escopo, permissoes, ativo, expires_at) values
  ('00000000-0000-0000-0000-00000c1e0901', '00000000-0000-0000-0000-00000c1e0a00', 'Site', 'rent_a_car',
   '{reservas:write,conta:read}', true, null),
  ('00000000-0000-0000-0000-00000c1e0902', '00000000-0000-0000-0000-00000c1e0b00', 'Desactivada', 'rent_a_car',
   '{conta:read}', false, null),
  ('00000000-0000-0000-0000-00000c1e0903', '00000000-0000-0000-0000-00000c1e0b00', 'Expirada', 'rent_a_car',
   '{conta:read}', true, now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000c1e0904', '00000000-0000-0000-0000-00000c1e0b00', 'Contabilidade', 'contabilidade',
   '{conta:read}', true, null),
  ('00000000-0000-0000-0000-00000c1e0905', '00000000-0000-0000-0000-00000c1e0b00', 'Só reservas', 'rent_a_car',
   '{reservas:write}', true, null);

-- Fichas com o email da Ana: só a f05 serve (particular, da equipa, sem conta,
-- activa, não emissora, na org do registo). f06 e f0a partilham um email
-- (ambíguo: não liga). f08 é da Bia (ligação preguiçosa), f09 foi plantada
-- por uma reserva anónima.
insert into public.clientes (id, org_id, nome, email, telefone, nif, tipo_cliente, is_emissora, user_id, deleted_at,
                             created_by, created_at) values
  ('00000000-0000-0000-0000-00000c1e0f01', '00000000-0000-0000-0000-00000c1e0a00', 'Emissora com o email', 'ana@contacli.pt', null, null,
   'particular', true, null, null, '00000000-0000-0000-0000-00000c1e02ff', now() - interval '50 days'),
  ('00000000-0000-0000-0000-00000c1e0f02', '00000000-0000-0000-0000-00000c1e0a00', 'Empresa da Ana', 'ana@contacli.pt', null, null,
   'empresa', false, null, null, '00000000-0000-0000-0000-00000c1e02ff', now() - interval '9 days'),
  ('00000000-0000-0000-0000-00000c1e0f03', '00000000-0000-0000-0000-00000c1e0a00', 'Ana Apagada', 'ana@contacli.pt', null, null,
   'particular', false, null, now() - interval '1 day', '00000000-0000-0000-0000-00000c1e02ff', now() - interval '30 days'),
  ('00000000-0000-0000-0000-00000c1e0f04', '00000000-0000-0000-0000-00000c1e0a00', 'Ana de Outra Conta', 'ana@contacli.pt', null, null,
   'particular', false, '00000000-0000-0000-0000-00000c1e0399', null, '00000000-0000-0000-0000-00000c1e02ff', now() - interval '20 days'),
  ('00000000-0000-0000-0000-00000c1e0f05', '00000000-0000-0000-0000-00000c1e0a00', 'Ana Ficha', ' Ana@ContaCli.PT ', '+351 911 111 111', '213456788',
   'particular', false, null, null, '00000000-0000-0000-0000-00000c1e02ff', now() - interval '10 days'),
  ('00000000-0000-0000-0000-00000c1e0f06', '00000000-0000-0000-0000-00000c1e0a00', 'Dupla Um', 'dupla@contacli.pt', null, null,
   'particular', false, null, null, '00000000-0000-0000-0000-00000c1e02ff', now() - interval '5 days'),
  ('00000000-0000-0000-0000-00000c1e0f0a', '00000000-0000-0000-0000-00000c1e0a00', 'Dupla Dois', ' DUPLA@contacli.pt', null, null,
   'particular', false, null, null, '00000000-0000-0000-0000-00000c1e02ff', now() - interval '4 days'),
  ('00000000-0000-0000-0000-00000c1e0f07', '00000000-0000-0000-0000-00000c1e0a00', 'Bruno Balcao', 'bruno@contacli.pt', null, '234567899',
   'particular', false, null, null, '00000000-0000-0000-0000-00000c1e02ff', now() - interval '5 days'),
  ('00000000-0000-0000-0000-00000c1e0f08', '00000000-0000-0000-0000-00000c1e0a00', 'Bia Balcao', 'bia@contacli.pt', null, null,
   'particular', false, null, null, '00000000-0000-0000-0000-00000c1e02ff', now() - interval '5 days'),
  ('00000000-0000-0000-0000-00000c1e0f09', '00000000-0000-0000-0000-00000c1e0a00', 'Carla Plantada', 'carla@contacli.pt', null, null,
   'particular', false, null, null, null, now() - interval '30 days'),
  ('00000000-0000-0000-0000-00000c1e0fb1', '00000000-0000-0000-0000-00000c1e0b00', 'Ana na Org B', 'ana@contacli.pt', null, null,
   'particular', false, null, null, '00000000-0000-0000-0000-00000c1e02ff', now() - interval '60 days'),
  ('00000000-0000-0000-0000-00000c1e0fb2', '00000000-0000-0000-0000-00000c1e0b00', 'Bia na Org B', 'bia@contacli.pt', null, null,
   'particular', false, null, null, '00000000-0000-0000-0000-00000c1e02ff', now() - interval '60 days'),
  ('00000000-0000-0000-0000-00000c1e0fc1', '00000000-0000-0000-0000-00000c1e0c00', 'Ficha na Inactiva', 'inactiva@contacli.pt', null, null,
   'particular', false, null, null, '00000000-0000-0000-0000-00000c1e02ff', now() - interval '60 days');

-- f09 é uma ficha do registo cuja conta já não existe (user_id a null).
update public.clientes set criada_no_registo = true where id = '00000000-0000-0000-0000-00000c1e0f09';

-- ── 1. Registo sem confirmação: só o profile ────────────────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000c1e0101', 'ana@contacli.pt',
   jsonb_build_object('tipo_utilizador', 'cliente', 'org_id', '00000000-0000-0000-0000-00000c1e0a00',
                      'nome', 'Ana Conta', 'telefone', '+351 999 999 999'));

select is((select tipo_utilizador from public.profiles where id = '00000000-0000-0000-0000-00000c1e0101'),
  'cliente', 'registo de cliente cria o profile cliente');
select ok((select org_id is null and cargo_id is null and cargo is null and not coalesce(is_admin, false)
             from public.profiles where id = '00000000-0000-0000-0000-00000c1e0101'),
  'sem organização, sem cargo, sem admin');
select is((select count(*)::int from public.user_organizacoes where user_id = '00000000-0000-0000-0000-00000c1e0101'),
  0, 'sem membership');
select is((select count(*)::int from public.user_org_ativa where user_id = '00000000-0000-0000-0000-00000c1e0101'),
  0, 'sem org activa');
select is((select count(*)::int from public.domain_events where entity_id = '00000000-0000-0000-0000-00000c1e0101'),
  0, 'sem evento utilizador.criado');
select is((select count(*)::int from public.clientes where user_id = '00000000-0000-0000-0000-00000c1e0101'),
  0, 'sem email confirmado não liga a nenhuma ficha');

-- ── 2. Confirmar o email (ramo do trigger de update) liga à ficha existente ─
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-00000c1e0101';

select is((select user_id from public.clientes where id = '00000000-0000-0000-0000-00000c1e0f05'),
  '00000000-0000-0000-0000-00000c1e0101'::uuid,
  'org com chave de conta: confirmar liga à particular da equipa com o mesmo email');
select is((select count(*)::int from public.clientes where user_id = '00000000-0000-0000-0000-00000c1e0101'),
  1, 'uma só ficha: nem a emissora, nem a empresa, nem a apagada, nem a da org B');
select is((select user_id from public.clientes where id = '00000000-0000-0000-0000-00000c1e0f04'),
  '00000000-0000-0000-0000-00000c1e0399'::uuid, 'a ficha já ligada a outra conta não muda');
select ok((select nome = 'Ana Ficha' and telefone = '+351 911 111 111' and email = ' Ana@ContaCli.PT '
             from public.clientes where id = '00000000-0000-0000-0000-00000c1e0f05'),
  'a ficha existente só ganha user_id (nome, telefone e email ficam)');
select is((select count(*)::int from public.clientes where org_id = '00000000-0000-0000-0000-00000c1e0a00'),
  10, 'com ficha encontrada não cria outra');

-- Confirmar outra vez não cria nem troca nada.
update auth.users set email_confirmed_at = null where id = '00000000-0000-0000-0000-00000c1e0101';
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-00000c1e0101';
select ok((select count(*) = 1 from public.clientes where user_id = '00000000-0000-0000-0000-00000c1e0101')
          and (select count(*) = 10 from public.clientes where org_id = '00000000-0000-0000-0000-00000c1e0a00'),
  'confirmar outra vez não cria outra ficha');

-- ── 3. Criada já confirmada (ramo do insert): ficha nova com os dados ───────
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000c1e0102', 'Novo@ContaCli.pt', now(),
   jsonb_build_object('tipo_utilizador', 'cliente', 'org_id', '00000000-0000-0000-0000-00000c1e0a00',
                      'nome', '  Nuno Novo ', 'telefone', '+351 912 000 222', 'data_nascimento', '1985-02-03',
                      'pais', 'Espanha', 'nif', '245 678 905', 'morada', 'Rua Nova 1',
                      'codigo_postal', '2400-001', 'localidade', 'Leiria'));

select ok(exists (
    select 1 from public.clientes
     where user_id = '00000000-0000-0000-0000-00000c1e0102'
       and org_id = '00000000-0000-0000-0000-00000c1e0a00'
       and nome = 'Nuno Novo' and email = 'novo@contacli.pt' and telefone = '+351 912 000 222'
       and data_nascimento = date '1985-02-03' and pais = 'Espanha'
       and morada = 'Rua Nova 1' and codigo_postal = '2400-001' and localidade = 'Leiria'
       and tipo_cliente = 'particular' and not is_emissora and created_by is null and deleted_at is null),
  'sem ficha com o email cria uma com os dados do registo');
select ok((select nif is null and observacoes = 'NIF indicado no registo (por confirmar): 245678905'
             from public.clientes where user_id = '00000000-0000-0000-0000-00000c1e0102'),
  'o NIF do registo não vai para a ficha (ninguém o verificou): fica nas observações, por confirmar');
select ok((select tipo_utilizador = 'cliente' and org_id is null from public.profiles
            where id = '00000000-0000-0000-0000-00000c1e0102')
          and not exists (select 1 from public.user_organizacoes where user_id = '00000000-0000-0000-0000-00000c1e0102'),
  'criada já confirmada continua sem org nem membership');

select ok((select criada_no_registo from public.clientes where user_id = '00000000-0000-0000-0000-00000c1e0102')
          and not (select criada_no_registo from public.clientes where id = '00000000-0000-0000-0000-00000c1e0f05'),
  'só a ficha criada pelo registo fica marcada criada_no_registo; a da equipa ligada não');

-- ── 4. NIF inválido, data inválida e sem nome ───────────────────────────────
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000c1e0103', 'sem.nome@contacli.pt', now(),
   jsonb_build_object('tipo_utilizador', 'cliente', 'org_id', '00000000-0000-0000-0000-00000c1e0a00',
                      'nif', '123456780', 'data_nascimento', '1990-02-30'));

select ok((select nif is null and observacoes is null from public.clientes where user_id = '00000000-0000-0000-0000-00000c1e0103'),
  'NIF inválido não é gravado nem nas observações (e a ficha nasce na mesma)');
select ok((select nome = 'sem.nome' and data_nascimento is null and pais = 'Portugal'
             from public.clientes where user_id = '00000000-0000-0000-0000-00000c1e0103'),
  'sem nome usa a parte local do email; data inválida fica vazia; país Portugal');

-- ── 5. Org inactiva, inexistente, lixo ou sem chave de conta: não liga nem cria
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000c1e0104', 'inactiva@contacli.pt', now(),
   jsonb_build_object('tipo_utilizador', 'cliente', 'org_id', '00000000-0000-0000-0000-00000c1e0c00')),
  ('00000000-0000-0000-0000-00000c1e0105', 'inexistente@contacli.pt', now(),
   jsonb_build_object('tipo_utilizador', 'cliente', 'org_id', '00000000-0000-0000-0000-00000c1e0d00')),
  ('00000000-0000-0000-0000-00000c1e0106', 'lixo@contacli.pt', now(),
   jsonb_build_object('tipo_utilizador', 'cliente', 'org_id', 'nao-e-um-uuid')),
  ('00000000-0000-0000-0000-00000c1e0112', 'bia@contacli.pt', now(),
   jsonb_build_object('tipo_utilizador', 'cliente', 'org_id', '00000000-0000-0000-0000-00000c1e0b00'));

select is((select count(*)::int from public.clientes
            where user_id in ('00000000-0000-0000-0000-00000c1e0104', '00000000-0000-0000-0000-00000c1e0105',
                              '00000000-0000-0000-0000-00000c1e0106')),
  0, 'org inactiva, inexistente ou lixo: nenhuma ficha ligada nem criada');
select is((select count(*)::int from public.profiles
            where id in ('00000000-0000-0000-0000-00000c1e0104', '00000000-0000-0000-0000-00000c1e0105',
                         '00000000-0000-0000-0000-00000c1e0106', '00000000-0000-0000-0000-00000c1e0112')
              and tipo_utilizador = 'cliente' and org_id is null),
  4, 'o registo continua a criar o profile de cliente');
select ok(not exists (select 1 from public.clientes where user_id = '00000000-0000-0000-0000-00000c1e0112')
          and (select user_id is null from public.clientes where id = '00000000-0000-0000-0000-00000c1e0fb2')
          and (select count(*) = 2 from public.clientes where org_id = '00000000-0000-0000-0000-00000c1e0b00'),
  'org sem chave conta:read activa (desactivada, expirada, outro escopo, sem permissão): não liga nem cria');

-- ── 5b. Ficha criada no registo (criada_no_registo): não é candidata
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000c1e0113', 'carla@contacli.pt', now(),
   jsonb_build_object('tipo_utilizador', 'cliente', 'org_id', '00000000-0000-0000-0000-00000c1e0a00', 'nome', 'Carla Conta'));

select ok((select user_id is null from public.clientes where id = '00000000-0000-0000-0000-00000c1e0f09')
          and exists (select 1 from public.clientes
                       where user_id = '00000000-0000-0000-0000-00000c1e0113'
                         and org_id = '00000000-0000-0000-0000-00000c1e0a00'
                         and id <> '00000000-0000-0000-0000-00000c1e0f09' and nome = 'Carla Conta'),
  'ficha criada no registo com o mesmo email não é ligada: nasce uma ficha nova');

-- ── 5c. Ligação preguiçosa: primeiro pedido com a chave de uma org ──────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000c1e0111', 'pendente@contacli.pt',
   jsonb_build_object('tipo_utilizador', 'cliente', 'org_id', '00000000-0000-0000-0000-00000c1e0a00'));

-- Em instruções separadas: a ficha criada pela função não é visível ao resto
-- da instrução que a chamou.
create temp table preg as
  select public.api_conta('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0104') as x;
grant select on preg to public;
select ok((select (x->'cliente'->>'id')::uuid from preg) = (
            select id from public.clientes
             where user_id = '00000000-0000-0000-0000-00000c1e0104'
               and org_id = '00000000-0000-0000-0000-00000c1e0a00' and email = 'inactiva@contacli.pt'),
  'conta confirmada sem ficha: a primeira api_conta cria-a na org da chave (não na do registo)');
select is(public.api_conta_reservas('00000000-0000-0000-0000-00000c1e0b00', '00000000-0000-0000-0000-00000c1e0112'),
  '[]'::jsonb, 'org sem chave de conta: api_conta_reservas não liga');
select ok((select user_id is null from public.clientes where id = '00000000-0000-0000-0000-00000c1e0fb2'),
  'a ficha da org sem chave continua sem conta');
select is(public.api_conta_reservas('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0112'),
  '[]'::jsonb, 'api_conta_reservas com a chave da org A: sem reservas');
select is((select user_id from public.clientes where id = '00000000-0000-0000-0000-00000c1e0f08'),
  '00000000-0000-0000-0000-00000c1e0112'::uuid, 'e ligou a conta à ficha da equipa com o mesmo email');
select ok((select x->'cliente' = 'null'::jsonb
             from (select public.api_conta('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0111') x) t)
          and not exists (select 1 from public.clientes where user_id = '00000000-0000-0000-0000-00000c1e0111'),
  'conta sem email confirmado: a ligação preguiçosa não liga nem cria');

-- ── 5d. Email partilhado: duas fichas candidatas, não liga nem cria ────────
create temp table n_dupla as select count(*)::int as n from public.clientes where org_id = '00000000-0000-0000-0000-00000c1e0a00';
grant select on n_dupla to public;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000c1e0115', 'dupla@contacli.pt', now(),
   jsonb_build_object('tipo_utilizador', 'cliente', 'org_id', '00000000-0000-0000-0000-00000c1e0a00', 'nome', 'Dupla Conta'));

select ok(not exists (select 1 from public.clientes where user_id = '00000000-0000-0000-0000-00000c1e0115')
          and (select count(*) from public.clientes where org_id = '00000000-0000-0000-0000-00000c1e0a00') = (select n from n_dupla),
  'duas fichas da equipa com o email da conta: confirmar não liga nenhuma nem cria outra');
select is(public.api_conta('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0115')->'cliente',
  'null'::jsonb, 'email ambíguo: api_conta devolve cliente null (contactar a equipa)');
select ok(not exists (select 1 from public.clientes where user_id = '00000000-0000-0000-0000-00000c1e0115')
          and (select count(*) from public.clientes where org_id = '00000000-0000-0000-0000-00000c1e0a00') = (select n from n_dupla),
  'e a ligação preguiçosa também não liga nem cria');

-- ── 6. Motorista, colaborador e convite continuam iguais ────────────────────
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000c1e0107', 'motorista@contacli.pt',
   jsonb_build_object('tipo_utilizador', 'motorista', 'org_id', '00000000-0000-0000-0000-00000c1e0a00')),
  ('00000000-0000-0000-0000-00000c1e0108', 'colab@contacli.pt',
   jsonb_build_object('tipo_utilizador', 'colaborador', 'org_id', '00000000-0000-0000-0000-00000c1e0a00'));

select ok((select tipo_utilizador = 'motorista' and org_id = '00000000-0000-0000-0000-00000c1e0a00'
                  and cargo_id = 'a0000000-0000-0000-0000-000000000001'
             from public.profiles where id = '00000000-0000-0000-0000-00000c1e0107')
          and exists (select 1 from public.user_organizacoes
                       where user_id = '00000000-0000-0000-0000-00000c1e0107'
                         and org_id = '00000000-0000-0000-0000-00000c1e0a00'),
  'registo de motorista continua: org escolhida, cargo Motorista, membership');
select ok((select tipo_utilizador = 'colaborador' and org_id is null
             from public.profiles where id = '00000000-0000-0000-0000-00000c1e0108')
          and not exists (select 1 from public.user_organizacoes where user_id = '00000000-0000-0000-0000-00000c1e0108'),
  'registo de colaborador sem convite continua sem org');

update auth.users set email_confirmed_at = now()
 where id in ('00000000-0000-0000-0000-00000c1e0107', '00000000-0000-0000-0000-00000c1e0108');
select is((select count(*)::int from public.clientes
            where user_id in ('00000000-0000-0000-0000-00000c1e0107', '00000000-0000-0000-0000-00000c1e0108')),
  0, 'confirmar o email de motorista ou colaborador não toca nas fichas de cliente');

insert into public.convites (email, token, usado, expires_at, org_id) values
  ('convidado@contacli.pt', 'tok-contacli-1', false, now() + interval '1 day', '00000000-0000-0000-0000-00000c1e0a00');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000c1e0109', 'convidado@contacli.pt',
   jsonb_build_object('tipo_utilizador', 'cliente', 'org_id', '00000000-0000-0000-0000-00000c1e0a00'));
select ok((select tipo_utilizador = 'colaborador' and org_id = '00000000-0000-0000-0000-00000c1e0a00'
             from public.profiles where id = '00000000-0000-0000-0000-00000c1e0109'),
  'com convite válido para o email, o convite manda');

-- Bruno: conta própria ligada à ficha do balcão (condutor nas faturas).
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000c1e0114', 'bruno@contacli.pt', now(),
   jsonb_build_object('tipo_utilizador', 'cliente', 'org_id', '00000000-0000-0000-0000-00000c1e0a00'));
select is((select user_id from public.clientes where id = '00000000-0000-0000-0000-00000c1e0f07'),
  '00000000-0000-0000-0000-00000c1e0114'::uuid, 'fixture: conta do Bruno ligada à ficha dele');

-- ── Fixture das reservas ────────────────────────────────────────────────────
insert into public.org_definicoes (org_id, iva_rent_a_car) values ('00000000-0000-0000-0000-00000c1e0a00', 23)
  on conflict (org_id) do update set iva_rent_a_car = 23;
insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-00000c1e0aa1', '00000000-0000-0000-0000-00000c1e0a00', 'Renault'),
  ('00000000-0000-0000-0000-00000c1e0ab1', '00000000-0000-0000-0000-00000c1e0b00', 'Renault');
insert into public.viatura_modelos (id, org_id, marca_id, nome, caixa, lugares, portas, bagageira) values
  ('00000000-0000-0000-0000-00000c1e0d01', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0aa1', 'Clio', 'manual', 5, 5, 2),
  ('00000000-0000-0000-0000-00000c1e0d02', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0aa1', 'Captur', 'automatica', 5, 5, 3),
  ('00000000-0000-0000-0000-00000c1e0db1', '00000000-0000-0000-0000-00000c1e0b00', '00000000-0000-0000-0000-00000c1e0ab1', 'Clio', 'manual', 5, 5, 2);
insert into public.renting_grupos (id, org_id, nome, codigo, ativo) values
  ('00000000-0000-0000-0000-00000c1e0c01', '00000000-0000-0000-0000-00000c1e0a00', 'Citadino', 'CIT', true);
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id, grupo_id, is_slot, status) values
  ('00000000-0000-0000-0000-00000c1e0e01', '00000000-0000-0000-0000-00000c1e0a00', 'CC-01-AA', '00000000-0000-0000-0000-00000c1e0aa1', '00000000-0000-0000-0000-00000c1e0d01', '00000000-0000-0000-0000-00000c1e0c01', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000c1e0e02', '00000000-0000-0000-0000-00000c1e0a00', 'CC-02-AA', '00000000-0000-0000-0000-00000c1e0aa1', '00000000-0000-0000-0000-00000c1e0d01', '00000000-0000-0000-0000-00000c1e0c01', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000c1e0e03', '00000000-0000-0000-0000-00000c1e0a00', 'CC-03-AA', '00000000-0000-0000-0000-00000c1e0aa1', '00000000-0000-0000-0000-00000c1e0d01', '00000000-0000-0000-0000-00000c1e0c01', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000c1e0e04', '00000000-0000-0000-0000-00000c1e0a00', 'CC-04-AA', '00000000-0000-0000-0000-00000c1e0aa1', '00000000-0000-0000-0000-00000c1e0d01', '00000000-0000-0000-0000-00000c1e0c01', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000c1e0e05', '00000000-0000-0000-0000-00000c1e0a00', 'CC-05-AA', '00000000-0000-0000-0000-00000c1e0aa1', '00000000-0000-0000-0000-00000c1e0d02', '00000000-0000-0000-0000-00000c1e0c01', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000c1e0e06', '00000000-0000-0000-0000-00000c1e0a00', 'CC-06-AA', '00000000-0000-0000-0000-00000c1e0aa1', '00000000-0000-0000-0000-00000c1e0d02', '00000000-0000-0000-0000-00000c1e0c01', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000c1e0e07', '00000000-0000-0000-0000-00000c1e0a00', 'CC-07-AA', '00000000-0000-0000-0000-00000c1e0aa1', '00000000-0000-0000-0000-00000c1e0d02', '00000000-0000-0000-0000-00000c1e0c01', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000c1e0e08', '00000000-0000-0000-0000-00000c1e0a00', 'CC-08-AA', '00000000-0000-0000-0000-00000c1e0aa1', '00000000-0000-0000-0000-00000c1e0d02', '00000000-0000-0000-0000-00000c1e0c01', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000c1e0e09', '00000000-0000-0000-0000-00000c1e0a00', 'CC-09-AA', '00000000-0000-0000-0000-00000c1e0aa1', '00000000-0000-0000-0000-00000c1e0d02', '00000000-0000-0000-0000-00000c1e0c01', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000c1e0e0a', '00000000-0000-0000-0000-00000c1e0a00', 'CC-10-AA', '00000000-0000-0000-0000-00000c1e0aa1', '00000000-0000-0000-0000-00000c1e0d02', '00000000-0000-0000-0000-00000c1e0c01', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000c1e0e0b', '00000000-0000-0000-0000-00000c1e0a00', 'CC-11-AA', '00000000-0000-0000-0000-00000c1e0aa1', '00000000-0000-0000-0000-00000c1e0d02', '00000000-0000-0000-0000-00000c1e0c01', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000c1e0e0c', '00000000-0000-0000-0000-00000c1e0a00', 'CC-12-AA', '00000000-0000-0000-0000-00000c1e0aa1', '00000000-0000-0000-0000-00000c1e0d01', '00000000-0000-0000-0000-00000c1e0c01', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000c1e0e0d', '00000000-0000-0000-0000-00000c1e0a00', 'CC-13-AA', '00000000-0000-0000-0000-00000c1e0aa1', '00000000-0000-0000-0000-00000c1e0d01', '00000000-0000-0000-0000-00000c1e0c01', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000c1e0e0e', '00000000-0000-0000-0000-00000c1e0a00', 'CC-14-AA', '00000000-0000-0000-0000-00000c1e0aa1', '00000000-0000-0000-0000-00000c1e0d01', '00000000-0000-0000-0000-00000c1e0c01', false, 'disponivel'),
  ('00000000-0000-0000-0000-00000c1e0eb1', '00000000-0000-0000-0000-00000c1e0b00', 'CB-01-BB', '00000000-0000-0000-0000-00000c1e0ab1', '00000000-0000-0000-0000-00000c1e0db1', null, false, 'disponivel');
insert into public.estacoes (id, org_id, nome, cidade, ativa) values
  ('00000000-0000-0000-0000-00000c1e0501', '00000000-0000-0000-0000-00000c1e0a00', 'Leiria', 'Leiria', true),
  ('00000000-0000-0000-0000-00000c1e0502', '00000000-0000-0000-0000-00000c1e0a00', 'Porto', 'Porto', true);

-- Da Ana (f05): r01 do site pendente com cotação (horas de Lisboa: 3 dias
-- mesmo com mudança de hora pelo meio); r02 do balcão confirmada (modelo
-- pela viatura, preço manual); r03 pendente já começada; r04 pendente futura
-- apagada; r05 TVDE. r06 é do Bruno; r07 da Ana na org B (pendente futura).
insert into public.reservas (id, org_id, estado, regime, origem, modelo_id, viatura_id, matricula,
                             estacao_entrega_id, estacao_recolha_id, data_inicio, data_fim, cliente_id,
                             valor_total, valor_total_manual, dados_site, deleted_at) values
  ('00000000-0000-0000-0000-00000c1e0b01', '00000000-0000-0000-0000-00000c1e0a00', 'pendente', 'rent_a_car', 'site',
   '00000000-0000-0000-0000-00000c1e0d01', '00000000-0000-0000-0000-00000c1e0e01', 'CC-01-AA',
   '00000000-0000-0000-0000-00000c1e0501', '00000000-0000-0000-0000-00000c1e0502',
   (date_trunc('day', now() at time zone 'Europe/Lisbon') + interval '10 days 10 hours') at time zone 'Europe/Lisbon',
   (date_trunc('day', now() at time zone 'Europe/Lisbon') + interval '13 days 10 hours') at time zone 'Europe/Lisbon',
   '00000000-0000-0000-0000-00000c1e0f05',
   105, 105, '{"cotacao": {"subtotal": {"sem_iva": 121.95, "com_iva": 150.00, "iva": 23}}}'::jsonb, null),
  ('00000000-0000-0000-0000-00000c1e0b02', '00000000-0000-0000-0000-00000c1e0a00', 'confirmada', 'rent_a_car', 'app',
   null, '00000000-0000-0000-0000-00000c1e0e02', 'CC-02-AA',
   '00000000-0000-0000-0000-00000c1e0501', '00000000-0000-0000-0000-00000c1e0501',
   now() + interval '20 days', now() + interval '22 days', '00000000-0000-0000-0000-00000c1e0f05',
   90, 123, null, null),
  ('00000000-0000-0000-0000-00000c1e0b03', '00000000-0000-0000-0000-00000c1e0a00', 'pendente', 'rent_a_car', 'site',
   '00000000-0000-0000-0000-00000c1e0d01', null, null, null, null,
   now() - interval '1 day', now() + interval '2 days', '00000000-0000-0000-0000-00000c1e0f05',
   60, null, null, null),
  ('00000000-0000-0000-0000-00000c1e0b04', '00000000-0000-0000-0000-00000c1e0a00', 'pendente', 'rent_a_car', 'site',
   '00000000-0000-0000-0000-00000c1e0d01', null, null, null, null,
   now() + interval '30 days', now() + interval '31 days', '00000000-0000-0000-0000-00000c1e0f05',
   35, null, null, now()),
  ('00000000-0000-0000-0000-00000c1e0b05', '00000000-0000-0000-0000-00000c1e0a00', 'pendente', 'tvde', 'app',
   null, null, null, null, null,
   now() + interval '30 days', now() + interval '60 days', '00000000-0000-0000-0000-00000c1e0f05',
   null, null, null, null),
  ('00000000-0000-0000-0000-00000c1e0b06', '00000000-0000-0000-0000-00000c1e0a00', 'pendente', 'rent_a_car', 'site',
   '00000000-0000-0000-0000-00000c1e0d01', null, null, null, null,
   now() + interval '15 days', now() + interval '16 days', '00000000-0000-0000-0000-00000c1e0f07',
   35, null, null, null),
  ('00000000-0000-0000-0000-00000c1e0b07', '00000000-0000-0000-0000-00000c1e0b00', 'pendente', 'rent_a_car', 'site',
   '00000000-0000-0000-0000-00000c1e0db1', null, null, null, null,
   now() + interval '15 days', now() + interval '16 days', '00000000-0000-0000-0000-00000c1e0fb1',
   35, null, null, null);
-- Os códigos são por org: o da r07 não pode coincidir com um da Ana na org A.
update public.reservas set codigo = 900007 where id = '00000000-0000-0000-0000-00000c1e0b07';

create temp table cod as select id, codigo from public.reservas
 where id::text like '00000000-0000-0000-0000-00000c1e0b0_';
grant select on cod to public;

-- ── 7. api_conta ────────────────────────────────────────────────────────────
select ok((select x->>'email' = 'ana@contacli.pt' and (x->>'email_confirmado')::boolean and x->>'tipo' = 'cliente'
                  and x->'cliente'->>'id' = '00000000-0000-0000-0000-00000c1e0f05'
                  and x->'cliente'->>'nome' = 'Ana Ficha' and x->'motorista' = 'null'::jsonb
             from (select public.api_conta('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101') x) t),
  'api_conta: email, confirmado, tipo cliente e a ficha ligada');
select is(public.api_conta('00000000-0000-0000-0000-00000c1e0b00', '00000000-0000-0000-0000-00000c1e0101')->'cliente',
  'null'::jsonb, 'api_conta na org sem chave de conta: sem ficha');
select ok((select user_id is null from public.clientes where id = '00000000-0000-0000-0000-00000c1e0fb1'),
  'e não liga a ficha da equipa dessa org com o mesmo email');
select is(public.api_conta('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0fff')->'erro'->>'codigo',
  'CONTA_INVALIDA', 'api_conta de conta inexistente: CONTA_INVALIDA');
select is(public.api_conta('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0107')->'motorista',
  '{"candidatura": null, "ficha": false}'::jsonb, 'api_conta de motorista: bloco motorista sem candidatura nem ficha');
select ok(not exists (select 1 from public.clientes where user_id = '00000000-0000-0000-0000-00000c1e0107'),
  'api_conta de motorista não cria ficha de cliente');

-- ── 8. api_conta_reservas ───────────────────────────────────────────────────
create temp table lista as
  select public.api_conta_reservas('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101') as l;
grant select on lista to public;
create temp view item as
  select x as i, (x->>'codigo')::bigint as codigo from lista, jsonb_array_elements(lista.l) x;
grant select on item to public;

select is((select jsonb_array_length(l) from lista), 3,
  'só as rent-a-car activas da ficha ligada: sem a apagada, a TVDE, a de outro cliente e a da org B');
select is((select jsonb_path_query_array(l, '$[*].codigo') from lista),
  jsonb_build_array((select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b02'),
                    (select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b01'),
                    (select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b03')),
  'mais recentes primeiro (pelo início)');
select ok((select i->'matricula' = 'null'::jsonb and (i->>'pode_cancelar')::boolean
                  and i->>'estado' = 'pendente' and i->>'origem' = 'site' and (i->>'dias')::int = 3
             from item where codigo = (select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b01')),
  'pendente do site: sem matrícula e pode cancelar');
select is((select i->'total' from item where codigo = (select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b01')),
  '{"sem_iva": 121.95, "com_iva": 150.00, "iva": 23}'::jsonb, 'total do site sai da cotação');
select ok((select i->'modelo' = '{"marca": "Renault", "modelo": "Clio"}'::jsonb
                  and i->'estacoes' = '{"entrega": "Leiria", "recolha": "Porto"}'::jsonb
             from item where codigo = (select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b01')),
  'modelo e nomes das estações');
select ok((select i->>'matricula' = 'CC-02-AA' and i->'modelo' = '{"marca": "Renault", "modelo": "Clio"}'::jsonb
                  and (i->'total'->>'com_iva')::numeric = 123.00 and not (i->>'pode_cancelar')::boolean
             from item where codigo = (select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b02')),
  'confirmada do balcão: matrícula, modelo pela viatura, total pelo preço manual, não cancela');
select ok((select not (i->>'pode_cancelar')::boolean
             from item where codigo = (select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b03')),
  'pendente já começada não pode cancelar');
select is(public.api_conta_reservas('00000000-0000-0000-0000-00000c1e0b00', '00000000-0000-0000-0000-00000c1e0101'),
  '[]'::jsonb, 'noutra org (sem chave de conta) a conta não vê reservas');
select is(public.api_conta_reservas('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0111'),
  '[]'::jsonb, 'conta sem ficha ligada: lista vazia');

-- ── 9. api_conta_cancelar_reserva ───────────────────────────────────────────
select is(public.api_conta_cancelar_reserva('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101',
  (select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b06'))->'erro'->>'codigo',
  'NAO_ENCONTRADO', 'reserva de outro cliente: NAO_ENCONTRADO');
select is(public.api_conta_cancelar_reserva('00000000-0000-0000-0000-00000c1e0b00', '00000000-0000-0000-0000-00000c1e0101',
  (select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b07'))->'erro'->>'codigo',
  'NAO_ENCONTRADO', 'reserva da outra org: NAO_ENCONTRADO');
select is(public.api_conta_cancelar_reserva('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101',
  (select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b05'))->'erro'->>'codigo',
  'NAO_ENCONTRADO', 'reserva TVDE da mesma ficha: NAO_ENCONTRADO');
select is(public.api_conta_cancelar_reserva('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101',
  999999999)->'erro'->>'codigo', 'NAO_ENCONTRADO', 'código inexistente: NAO_ENCONTRADO');
select is(public.api_conta_cancelar_reserva('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101',
  (select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b04'))->'erro'->>'codigo',
  'NAO_ENCONTRADO', 'reserva própria pendente futura mas apagada: NAO_ENCONTRADO');
select ok((select estado::text = 'pendente' and deleted_at is not null
             from public.reservas where id = '00000000-0000-0000-0000-00000c1e0b04'),
  'a reserva apagada não muda de estado');
select is(public.api_conta_cancelar_reserva('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101',
  (select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b02'))->'erro'->>'codigo',
  'ESTADO_INVALIDO', 'confirmada: ESTADO_INVALIDO');
select is(public.api_conta_cancelar_reserva('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101',
  (select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b03'))->'erro'->>'codigo',
  'ESTADO_INVALIDO', 'pendente já começada: ESTADO_INVALIDO');
select ok((select x->>'estado' = 'cancelada' and not (x->>'pode_cancelar')::boolean
             from (select public.api_conta_cancelar_reserva('00000000-0000-0000-0000-00000c1e0a00',
                     '00000000-0000-0000-0000-00000c1e0101',
                     (select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b01')) x) t),
  'pendente futura própria: cancelada');
select ok((select estado::text = 'cancelada' from public.reservas where id = '00000000-0000-0000-0000-00000c1e0b01')
          and (select estado::text = 'pendente' from public.reservas where id = '00000000-0000-0000-0000-00000c1e0b06')
          and (select estado::text = 'confirmada' from public.reservas where id = '00000000-0000-0000-0000-00000c1e0b02'),
  'só essa reserva mudou');
select is(public.api_conta_cancelar_reserva('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101',
  (select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b01'))->>'estado',
  'cancelada', 'cancelar outra vez devolve-a como está');

-- ── 10. Faturas: pelo destinatário fiscal, não pelo titular do contrato ─────
-- c1 é da Ana (titular), c2 do Bruno. No c1 há cobranças à Ana (cb1) e ao
-- Bruno como condutor (cb2); no c2 uma ao Bruno (cb3).
insert into public.reservas (id, org_id, estado, data_inicio, data_fim, cliente_id, created_by) values
  ('00000000-0000-0000-0000-00000c1e0b11', '00000000-0000-0000-0000-00000c1e0a00', 'confirmada',
   now() + interval '9 days', now() + interval '43 days', '00000000-0000-0000-0000-00000c1e0f05',
   '00000000-0000-0000-0000-00000c1e02ff'),
  ('00000000-0000-0000-0000-00000c1e0b12', '00000000-0000-0000-0000-00000c1e0a00', 'confirmada',
   now() + interval '9 days', now() + interval '43 days', '00000000-0000-0000-0000-00000c1e0f07',
   '00000000-0000-0000-0000-00000c1e02ff');
insert into public.contratos_renting
  (id, org_id, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, created_by) values
  ('00000000-0000-0000-0000-00000c1e0cc1', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0b11',
   '00000000-0000-0000-0000-00000c1e0f05', '00000000-0000-0000-0000-00000c1e0e03', 'CC-03-AA',
   now() + interval '9 days', now() + interval '43 days', 'agendado', 'pendente', 'rent_a_car', 23,
   '00000000-0000-0000-0000-00000c1e02ff'),
  ('00000000-0000-0000-0000-00000c1e0cc2', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0b12',
   '00000000-0000-0000-0000-00000c1e0f07', '00000000-0000-0000-0000-00000c1e0e04', 'CC-04-AA',
   now() + interval '9 days', now() + interval '43 days', 'agendado', 'pendente', 'rent_a_car', 23,
   '00000000-0000-0000-0000-00000c1e02ff');
insert into public.contrato_cobrancas (id, org_id, contrato_id, periodo_de, periodo_ate, destinatario_id,
                                       destinatario_papel, destinatario_nome, valor_sem_iva) values
  ('00000000-0000-0000-0000-00000c1e0ca1', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0cc1',
   current_date + 40, current_date + 43, '00000000-0000-0000-0000-00000c1e0f05', 'cliente', 'Ana Ficha', 100),
  ('00000000-0000-0000-0000-00000c1e0ca2', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0cc1',
   current_date + 40, current_date + 43, '00000000-0000-0000-0000-00000c1e0f07', 'condutor', 'Bruno Balcao', 50),
  ('00000000-0000-0000-0000-00000c1e0ca3', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0cc2',
   current_date + 40, current_date + 43, '00000000-0000-0000-0000-00000c1e0f07', 'cliente', 'Bruno Balcao', 80);
-- a11/a12 da Ana pela cobrança; a13 anulada; a14 do Bruno no c2; a15 ao Bruno
-- (condutor) no contrato da Ana; a16 sem cobrança com o NIF da Ana; a17 sem
-- cobrança com outro NIF; a18 sem cobrança nem NIF; a19 sem cobrança com o NIF
-- do Bruno num contrato onde ele não está.
insert into public.invoices (id, org_id, contrato_id, cobranca_id, tipo, serie, numero, data_emissao, total,
                             cliente_nif, status, created_at) values
  ('00000000-0000-0000-0000-00000c1e0a11', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0cc1',
   '00000000-0000-0000-0000-00000c1e0ca1', 'FT', 'FT 2026', '11', current_date - 10, 150.00, '213456788', 'emitida', now() - interval '10 days'),
  ('00000000-0000-0000-0000-00000c1e0a12', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0cc1',
   '00000000-0000-0000-0000-00000c1e0ca1', 'RC', 'RC 2026', '12', current_date - 2, 150.00, null, 'emitida', now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000c1e0a13', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0cc1',
   '00000000-0000-0000-0000-00000c1e0ca1', 'FT', 'FT 2026', '13', current_date - 1, 80.00, null, 'anulada', now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000c1e0a14', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0cc2',
   '00000000-0000-0000-0000-00000c1e0ca3', 'FT', 'FT 2026', '14', current_date - 1, 99.00, '234567899', 'emitida', now() - interval '1 day'),
  ('00000000-0000-0000-0000-00000c1e0a15', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0cc1',
   '00000000-0000-0000-0000-00000c1e0ca2', 'FT', 'FT 2026', '15', current_date - 3, 61.50, '234567899', 'emitida', now() - interval '3 days'),
  ('00000000-0000-0000-0000-00000c1e0a16', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0cc1',
   null, 'FT', 'FT 2026', '16', current_date - 5, 20.00, 'PT 213 456 788', 'emitida', now() - interval '5 days'),
  ('00000000-0000-0000-0000-00000c1e0a17', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0cc1',
   null, 'FT', 'FT 2026', '17', current_date - 4, 30.00, '222333448', 'emitida', now() - interval '4 days'),
  ('00000000-0000-0000-0000-00000c1e0a18', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0cc1',
   null, 'FT', 'FT 2026', '18', current_date - 4, 40.00, null, 'emitida', now() - interval '4 days'),
  ('00000000-0000-0000-0000-00000c1e0a19', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0cc1',
   null, 'FT', 'FT 2026', '19', current_date - 4, 45.00, '234567899', 'emitida', now() - interval '4 days');

select is(jsonb_path_query_array(public.api_conta_faturas('00000000-0000-0000-0000-00000c1e0a00',
            '00000000-0000-0000-0000-00000c1e0101'), '$[*].id'),
  '["00000000-0000-0000-0000-00000c1e0a12", "00000000-0000-0000-0000-00000c1e0a16", "00000000-0000-0000-0000-00000c1e0a11"]'::jsonb,
  'titular: as emitidas a ela (cobrança ou NIF), mais recentes primeiro');
select ok((select x->>'tipo' = 'RC' and x->>'serie' = 'RC 2026' and x->>'numero' = '12'
                  and (x->>'total')::numeric = 150.00 and (x->>'data_emissao')::date = current_date - 2
                  and (x->>'contrato_codigo')::bigint = (select codigo from public.contratos_renting
                                                          where id = '00000000-0000-0000-0000-00000c1e0cc1')
             from (select public.api_conta_faturas('00000000-0000-0000-0000-00000c1e0a00',
                     '00000000-0000-0000-0000-00000c1e0101')->0 x) t),
  'campos da fatura e código do contrato');
select is(public.api_conta_fatura('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101',
  '00000000-0000-0000-0000-00000c1e0a11')->>'id', '00000000-0000-0000-0000-00000c1e0a11', 'api_conta_fatura devolve a dela');
select is(public.api_conta_fatura('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101',
  '00000000-0000-0000-0000-00000c1e0a15')->'erro'->>'codigo', 'NAO_ENCONTRADO',
  'fatura ao condutor no contrato da titular: a titular não a obtém');
select is(public.api_conta_fatura('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101',
  '00000000-0000-0000-0000-00000c1e0a14')->'erro'->>'codigo', 'NAO_ENCONTRADO', 'fatura de outro cliente: NAO_ENCONTRADO');
select is(public.api_conta_fatura('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101',
  '00000000-0000-0000-0000-00000c1e0a13')->'erro'->>'codigo', 'NAO_ENCONTRADO', 'fatura anulada: NAO_ENCONTRADO');
select is(public.api_conta_fatura('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101',
  '00000000-0000-0000-0000-00000c1e0a17')->'erro'->>'codigo', 'NAO_ENCONTRADO',
  'sem cobrança e com outro NIF, no contrato dela: NAO_ENCONTRADO');
select is(public.api_conta_fatura('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101',
  '00000000-0000-0000-0000-00000c1e0a18')->'erro'->>'codigo', 'NAO_ENCONTRADO',
  'sem cobrança e sem NIF: NAO_ENCONTRADO');
select is(public.api_conta_fatura('00000000-0000-0000-0000-00000c1e0b00', '00000000-0000-0000-0000-00000c1e0101',
  '00000000-0000-0000-0000-00000c1e0a11')->'erro'->>'codigo', 'NAO_ENCONTRADO', 'pela chave de outra org: NAO_ENCONTRADO');
select is(jsonb_path_query_array(public.api_conta_faturas('00000000-0000-0000-0000-00000c1e0a00',
            '00000000-0000-0000-0000-00000c1e0114'), '$[*].id'),
  '["00000000-0000-0000-0000-00000c1e0a14", "00000000-0000-0000-0000-00000c1e0a15"]'::jsonb,
  'condutor com conta: vê a do contrato dele e a que lhe foi emitida no contrato da titular');
select is(public.api_conta_fatura('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0114',
  '00000000-0000-0000-0000-00000c1e0a15')->>'id', '00000000-0000-0000-0000-00000c1e0a15',
  'o condutor obtém a fatura emitida a ele');
select is(public.api_conta_fatura('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0114',
  '00000000-0000-0000-0000-00000c1e0a19')->'erro'->>'codigo', 'NAO_ENCONTRADO',
  'sem cobrança com o NIF dele num contrato onde não está: NAO_ENCONTRADO');
-- Bruno passa a condutor no c1: a a19 (sem cobrança, NIF dele) é dele, não da titular.
insert into public.contrato_condutores (org_id, contrato_id, cliente_id, is_principal, data_inicio) values
  ('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0cc1', '00000000-0000-0000-0000-00000c1e0f07', false, now() + interval '9 days');
select ok(public.api_conta_faturas('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0114') @> '[{"id": "00000000-0000-0000-0000-00000c1e0a19"}]'::jsonb,
  'sem cobrança, com o NIF dele e condutor no contrato: o condutor vê-a');
select is(public.api_conta_fatura('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101', '00000000-0000-0000-0000-00000c1e0a19')->'erro'->>'codigo', 'NAO_ENCONTRADO',
  'e a titular desse contrato não (o NIF não é o dela)');
select is(public.api_conta_faturas('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0111'),
  '[]'::jsonb, 'conta sem ficha ligada: sem faturas');

-- ── 10c. Faturas emitidas na reserva (sem contrato_id na fatura) ────────────
-- r21 sem contrato; r22 já convertida no c5 (a cobrança tem os dois); r23 TVDE.
insert into public.reservas (id, org_id, estado, regime, data_inicio, data_fim, cliente_id, created_by) values
  ('00000000-0000-0000-0000-00000c1e0b21', '00000000-0000-0000-0000-00000c1e0a00', 'confirmada', 'rent_a_car', now() + interval '70 days', now() + interval '73 days', '00000000-0000-0000-0000-00000c1e0f05', '00000000-0000-0000-0000-00000c1e02ff'),
  ('00000000-0000-0000-0000-00000c1e0b22', '00000000-0000-0000-0000-00000c1e0a00', 'confirmada', 'rent_a_car', now() + interval '80 days', now() + interval '83 days', '00000000-0000-0000-0000-00000c1e0f05', '00000000-0000-0000-0000-00000c1e02ff'),
  ('00000000-0000-0000-0000-00000c1e0b23', '00000000-0000-0000-0000-00000c1e0a00', 'confirmada', 'tvde', now() + interval '90 days', now() + interval '120 days', '00000000-0000-0000-0000-00000c1e0f05', '00000000-0000-0000-0000-00000c1e02ff');
insert into public.contratos_renting
  (id, org_id, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, created_by) values
  ('00000000-0000-0000-0000-00000c1e0cc5', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0b22', '00000000-0000-0000-0000-00000c1e0f05', '00000000-0000-0000-0000-00000c1e0e0c', 'CC-12-AA',
   now() + interval '80 days', now() + interval '83 days', 'agendado', 'pendente', 'rent_a_car', 23, '00000000-0000-0000-0000-00000c1e02ff');
insert into public.contrato_cobrancas (id, org_id, contrato_id, reserva_id, periodo_de, periodo_ate, destinatario_id,
                                       destinatario_papel, destinatario_nome, valor_sem_iva) values
  ('00000000-0000-0000-0000-00000c1e0cd1', '00000000-0000-0000-0000-00000c1e0a00', null, '00000000-0000-0000-0000-00000c1e0b21', current_date + 70, current_date + 73, '00000000-0000-0000-0000-00000c1e0f05', 'cliente', 'Ana Ficha', 100),
  ('00000000-0000-0000-0000-00000c1e0cd2', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0cc5', '00000000-0000-0000-0000-00000c1e0b22', current_date + 80, current_date + 83, '00000000-0000-0000-0000-00000c1e0f05', 'cliente', 'Ana Ficha', 100),
  ('00000000-0000-0000-0000-00000c1e0cd3', '00000000-0000-0000-0000-00000c1e0a00', null, '00000000-0000-0000-0000-00000c1e0b23', current_date + 90, current_date + 120, '00000000-0000-0000-0000-00000c1e0f05', 'cliente', 'Ana Ficha', 100);
insert into public.invoices (id, org_id, contrato_id, cobranca_id, tipo, serie, numero, data_emissao, total,
                             cliente_nif, status, created_at) values
  ('00000000-0000-0000-0000-00000c1e0a21', '00000000-0000-0000-0000-00000c1e0a00', null, '00000000-0000-0000-0000-00000c1e0cd1', 'FT', 'FT 2026', '21', current_date - 6, 123.00, '213456788', 'emitida', now() - interval '6 days'),
  ('00000000-0000-0000-0000-00000c1e0a22', '00000000-0000-0000-0000-00000c1e0a00', null, '00000000-0000-0000-0000-00000c1e0cd2', 'FT', 'FT 2026', '22', current_date - 6, 123.00, '213456788', 'emitida', now() - interval '6 days'),
  ('00000000-0000-0000-0000-00000c1e0a23', '00000000-0000-0000-0000-00000c1e0a00', null, '00000000-0000-0000-0000-00000c1e0cd3', 'FT', 'FT 2026', '23', current_date - 6, 123.00, '213456788', 'emitida', now() - interval '6 days');

create temp table fat_ana as select public.api_conta_faturas('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101') as l;
grant select on fat_ana to public;
select ok((select x->'contrato_codigo' = 'null'::jsonb
                  and (x->>'reserva_codigo')::bigint = (select codigo from public.reservas where id = '00000000-0000-0000-0000-00000c1e0b21')
             from fat_ana, jsonb_array_elements(fat_ana.l) x where x->>'id' = '00000000-0000-0000-0000-00000c1e0a21'),
  'fatura emitida na reserva, sem contrato: aparece ao destinatário, com o código da reserva');
select ok((select (x->>'contrato_codigo')::bigint = (select codigo from public.contratos_renting where id = '00000000-0000-0000-0000-00000c1e0cc5')
             from fat_ana, jsonb_array_elements(fat_ana.l) x where x->>'id' = '00000000-0000-0000-0000-00000c1e0a22'),
  'fatura da reserva já convertida em contrato: aparece, com o código do contrato pela cobrança');
select ok(not ((select l from fat_ana) @> '[{"id": "00000000-0000-0000-0000-00000c1e0a23"}]'::jsonb),
  'fatura de uma reserva TVDE: não aparece');
select is(public.api_conta_fatura('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0114', '00000000-0000-0000-0000-00000c1e0a21')->'erro'->>'codigo', 'NAO_ENCONTRADO',
  'a fatura da reserva não aparece a outra conta');

-- ── 10d. Sem cobrança só vale o NIF de uma ficha da equipa, e nunca vazio ───
-- Bia (f08, sem NIF) é titular do c3, com uma fatura sem cobrança e sem NIF.
-- A ficha do registo do Nuno ganha um NIF à mão; é titular do c4, com uma
-- fatura sem cobrança com esse NIF.
update public.clientes set nif = '245678905' where user_id = '00000000-0000-0000-0000-00000c1e0102';
insert into public.reservas (id, org_id, estado, data_inicio, data_fim, cliente_id, created_by) values
  ('00000000-0000-0000-0000-00000c1e0b13', '00000000-0000-0000-0000-00000c1e0a00', 'confirmada', now() + interval '9 days', now() + interval '43 days', '00000000-0000-0000-0000-00000c1e0f08', '00000000-0000-0000-0000-00000c1e02ff'),
  ('00000000-0000-0000-0000-00000c1e0b14', '00000000-0000-0000-0000-00000c1e0a00', 'confirmada', now() + interval '9 days', now() + interval '43 days',
   (select id from public.clientes where user_id = '00000000-0000-0000-0000-00000c1e0102'), '00000000-0000-0000-0000-00000c1e02ff');
insert into public.contratos_renting
  (id, org_id, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, created_by) values
  ('00000000-0000-0000-0000-00000c1e0cc3', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0b13', '00000000-0000-0000-0000-00000c1e0f08', '00000000-0000-0000-0000-00000c1e0e0d', 'CC-13-AA',
   now() + interval '9 days', now() + interval '43 days', 'agendado', 'pendente', 'rent_a_car', 23, '00000000-0000-0000-0000-00000c1e02ff'),
  ('00000000-0000-0000-0000-00000c1e0cc4', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0b14', (select id from public.clientes where user_id = '00000000-0000-0000-0000-00000c1e0102'), '00000000-0000-0000-0000-00000c1e0e0e', 'CC-14-AA',
   now() + interval '9 days', now() + interval '43 days', 'agendado', 'pendente', 'rent_a_car', 23, '00000000-0000-0000-0000-00000c1e02ff');
insert into public.invoices (id, org_id, contrato_id, cobranca_id, tipo, serie, numero, data_emissao, total,
                             cliente_nif, status, created_at) values
  ('00000000-0000-0000-0000-00000c1e0a24', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0cc3', null, 'FT', 'FT 2026', '24', current_date - 1, 10.00, null, 'emitida', now()),
  ('00000000-0000-0000-0000-00000c1e0a25', '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0cc4', null, 'FT', 'FT 2026', '25', current_date - 1, 10.00, '245 678 905', 'emitida', now());
select is(public.api_conta_faturas('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0112'), '[]'::jsonb,
  'ficha sem NIF, fatura sem cobrança e sem NIF no contrato dela: não aparece');
select is(public.api_conta_faturas('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0102'), '[]'::jsonb,
  'ficha criada no registo, com NIF posto depois: a fatura sem cobrança com esse NIF não aparece');

-- ── 10b. A mesma conta com ficha e dados na org B ───────────────────────────
-- A ficha da Ana na org B fica ligada à conta (como se a org B já tivesse tido
-- chave de conta); lá tem a r07 pendente futura e uma fatura emitida a ela.
update public.clientes set user_id = '00000000-0000-0000-0000-00000c1e0101'
 where id = '00000000-0000-0000-0000-00000c1e0fb1';
insert into public.reservas (id, org_id, estado, data_inicio, data_fim, cliente_id, created_by) values
  ('00000000-0000-0000-0000-00000c1e0bb1', '00000000-0000-0000-0000-00000c1e0b00', 'confirmada',
   now() + interval '9 days', now() + interval '43 days', '00000000-0000-0000-0000-00000c1e0fb1',
   '00000000-0000-0000-0000-00000c1e02ff');
insert into public.contratos_renting
  (id, org_id, reserva_id, cliente_id, viatura_id, matricula, data_inicio, data_fim,
   estado_operacional, estado_financeiro, regime, taxa_iva, created_by) values
  ('00000000-0000-0000-0000-00000c1e0cb1', '00000000-0000-0000-0000-00000c1e0b00', '00000000-0000-0000-0000-00000c1e0bb1',
   '00000000-0000-0000-0000-00000c1e0fb1', '00000000-0000-0000-0000-00000c1e0eb1', 'CB-01-BB',
   now() + interval '9 days', now() + interval '43 days', 'agendado', 'pendente', 'rent_a_car', 23,
   '00000000-0000-0000-0000-00000c1e02ff');
insert into public.contrato_cobrancas (id, org_id, contrato_id, periodo_de, periodo_ate, destinatario_id,
                                       destinatario_papel, destinatario_nome, valor_sem_iva) values
  ('00000000-0000-0000-0000-00000c1e0cb2', '00000000-0000-0000-0000-00000c1e0b00', '00000000-0000-0000-0000-00000c1e0cb1',
   current_date + 40, current_date + 43, '00000000-0000-0000-0000-00000c1e0fb1', 'cliente', 'Ana na Org B', 100);
insert into public.invoices (id, org_id, contrato_id, cobranca_id, tipo, serie, numero, data_emissao, total,
                             cliente_nif, status, created_at) values
  ('00000000-0000-0000-0000-00000c1e0ab9', '00000000-0000-0000-0000-00000c1e0b00', '00000000-0000-0000-0000-00000c1e0cb1',
   '00000000-0000-0000-0000-00000c1e0cb2', 'FT', 'FT B', '1', current_date, 123.00, null, 'emitida', now());

-- Controlo: os dados existem e a org B vê-os.
select ok((select (select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b07') in (
              select (x->>'codigo')::bigint from jsonb_array_elements(public.api_conta_reservas(
                '00000000-0000-0000-0000-00000c1e0b00', '00000000-0000-0000-0000-00000c1e0101')) x))
          and public.api_conta_faturas('00000000-0000-0000-0000-00000c1e0b00', '00000000-0000-0000-0000-00000c1e0101')
                @> '[{"id": "00000000-0000-0000-0000-00000c1e0ab9"}]'::jsonb,
  'controlo: com a chave da org B a conta vê a reserva e a fatura da org B');
select ok(not ((select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b07') in (
              select (x->>'codigo')::bigint from jsonb_array_elements(public.api_conta_reservas(
                '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101')) x)),
  'com a chave da org A, api_conta_reservas não lista a reserva da org B');
select is(public.api_conta_cancelar_reserva('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101',
  (select codigo from cod where id = '00000000-0000-0000-0000-00000c1e0b07'))->'erro'->>'codigo',
  'NAO_ENCONTRADO', 'com a chave da org A, cancelar a reserva da org B: NAO_ENCONTRADO');
select ok((select estado::text = 'pendente' from public.reservas where id = '00000000-0000-0000-0000-00000c1e0b07'),
  'a reserva da org B continua pendente');
select ok(not (public.api_conta_faturas('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101')
                 @> '[{"id": "00000000-0000-0000-0000-00000c1e0ab9"}]'::jsonb),
  'com a chave da org A, api_conta_faturas não devolve a fatura da org B');
select is(public.api_conta_fatura('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101',
  '00000000-0000-0000-0000-00000c1e0ab9')->'erro'->>'codigo', 'NAO_ENCONTRADO',
  'com a chave da org A, api_conta_fatura da org B: NAO_ENCONTRADO');

-- Dados da org B a apontar directamente para a ficha da Ana na org A (f05):
-- só o filtro org_id os separa.
insert into public.reservas (id, org_id, estado, regime, origem, modelo_id, data_inicio, data_fim, cliente_id, valor_total) values
  ('00000000-0000-0000-0000-00000c1e0bb2', '00000000-0000-0000-0000-00000c1e0b00', 'pendente', 'rent_a_car', 'site', '00000000-0000-0000-0000-00000c1e0db1',
   now() + interval '25 days', now() + interval '26 days', '00000000-0000-0000-0000-00000c1e0f05', 35);
-- Fica com um código da org B acima de 900007: nunca coincide com um da org A.
insert into public.contrato_cobrancas (id, org_id, contrato_id, reserva_id, periodo_de, periodo_ate, destinatario_id,
                                       destinatario_papel, destinatario_nome, valor_sem_iva) values
  ('00000000-0000-0000-0000-00000c1e0cb3', '00000000-0000-0000-0000-00000c1e0b00', null, '00000000-0000-0000-0000-00000c1e0bb2', current_date + 25, current_date + 26, '00000000-0000-0000-0000-00000c1e0f05', 'cliente', 'Ana Ficha', 30);
insert into public.invoices (id, org_id, contrato_id, cobranca_id, tipo, serie, numero, data_emissao, total,
                             cliente_nif, status, created_at) values
  ('00000000-0000-0000-0000-00000c1e0aba', '00000000-0000-0000-0000-00000c1e0b00', null, '00000000-0000-0000-0000-00000c1e0cb3', 'FT', 'FT B', '2', current_date, 36.90, '213456788', 'emitida', now());

create temp table lista_a as select public.api_conta_reservas('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101') as l;
grant select on lista_a to public;
select ok((select jsonb_array_length(l) from lista_a) = (
             select count(*) from public.reservas
              where org_id = '00000000-0000-0000-0000-00000c1e0a00' and cliente_id = '00000000-0000-0000-0000-00000c1e0f05' and regime::text = 'rent_a_car' and deleted_at is null)
          and not exists (select 1 from lista_a, jsonb_array_elements(lista_a.l) x where (x->>'codigo')::bigint = (select codigo from public.reservas where id = '00000000-0000-0000-0000-00000c1e0bb2')),
  'reserva da org B com a ficha da org A: com a chave da org A não aparece');
select is(public.api_conta_cancelar_reserva('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101', (select codigo from public.reservas where id = '00000000-0000-0000-0000-00000c1e0bb2'))->'erro'->>'codigo', 'NAO_ENCONTRADO',
  'nem se cancela com a chave da org A');
select ok((select estado::text = 'pendente' from public.reservas where id = '00000000-0000-0000-0000-00000c1e0bb2'),
  'e continua pendente');
select ok(not (public.api_conta_faturas('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101') @> '[{"id": "00000000-0000-0000-0000-00000c1e0aba"}]'::jsonb),
  'fatura com cobrança da org B à ficha da org A: com a chave da org A não aparece');

-- ── 11. api_criar_reserva com p_user_id ─────────────────────────────────────
insert into public.renting_tarifas (id, org_id, nome, tipo, ativa, tarifa_site) values
  ('00000000-0000-0000-0000-00000c1e0ff1', '00000000-0000-0000-0000-00000c1e0a00', 'Geral', 'renting', true, true);
insert into public.renting_tarifa_precos_modelo (org_id, tarifa_id, modelo_id, preco_dia, franquia_valor, caucao_valor, km_mensal, km_adicional_valor) values
  ('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0ff1', '00000000-0000-0000-0000-00000c1e0d02', 50.00, 1000, 400, 3000, 0.25);
update public.org_definicoes set emissor_rent_a_car_id = '00000000-0000-0000-0000-00000c1e0f01'
 where org_id = '00000000-0000-0000-0000-00000c1e0a00';

create temp table p as select
  ((date_trunc('day', now() at time zone 'Europe/Lisbon') + interval '5 days 10 hours') at time zone 'Europe/Lisbon') as inicio,
  ((date_trunc('day', now() at time zone 'Europe/Lisbon') + interval '8 days 10 hours') at time zone 'Europe/Lisbon') as fim;
grant select on p to public;
-- O pedido traz o NIF e o nome do Bruno: sem a conta, seria ele (por NIF) e divergente.
create temp table q as select jsonb_build_object(
  'modelo_id', '00000000-0000-0000-0000-00000c1e0d02',
  'inicio', (select inicio from p), 'fim', (select fim from p),
  'entrega', '00000000-0000-0000-0000-00000c1e0501', 'recolha', '00000000-0000-0000-0000-00000c1e0501',
  'extras', '[]'::jsonb,
  'cliente', jsonb_build_object('nome', 'Nome do Site', 'email', 'site@contacli.pt', 'telefone', '+351912345678',
                                'nif', '234567899', 'data_nascimento', '1990-05-01', 'pais', 'Portugal'),
  'carta_conducao', jsonb_build_object('numero', 'L-555', 'validade', '2030-01-01', 'pais', 'Portugal'),
  'total_esperado', (public.api_cotacao('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0d02',
     (select inicio from p), (select fim from p), '00000000-0000-0000-0000-00000c1e0501',
     '00000000-0000-0000-0000-00000c1e0501', '[]'::jsonb)->'subtotal'->>'com_iva')::numeric) as pedido;
grant select on q to public;
create temp table res (nome text primary key, r jsonb);
grant select, insert on res to public;
create temp table n0 as select count(*)::int as n from public.clientes where org_id = '00000000-0000-0000-0000-00000c1e0a00';
grant select on n0 to public;

insert into res select 'conta', public.api_criar_reserva('00000000-0000-0000-0000-00000c1e0a00',
  '00000000-0000-0000-0000-00000c1e0901',
  (select pedido || '{"referencia_externa": "conta-001"}'::jsonb from q),
  '00000000-0000-0000-0000-00000c1e0101');
-- Mesmo nome (maiúsculas e espaços à parte) e o mesmo NIF com espaços: não diverge.
insert into res select 'conta_igual', public.api_criar_reserva('00000000-0000-0000-0000-00000c1e0a00',
  '00000000-0000-0000-0000-00000c1e0901',
  (select jsonb_set(jsonb_set(pedido, '{cliente,nome}', '"  ana   FICHA "'), '{cliente,nif}', '"213 456 788"')
          || '{"referencia_externa": "conta-003"}'::jsonb from q),
  '00000000-0000-0000-0000-00000c1e0101');
-- Mesmo nome, NIF de outra pessoa: diverge só pelo NIF.
insert into res select 'conta_nif', public.api_criar_reserva('00000000-0000-0000-0000-00000c1e0a00',
  '00000000-0000-0000-0000-00000c1e0901',
  (select jsonb_set(pedido, '{cliente,nome}', '"Ana Ficha"') || '{"referencia_externa": "conta-004"}'::jsonb from q),
  '00000000-0000-0000-0000-00000c1e0101');
-- Nome diferente, NIF igual ao da ficha: diverge só pelo nome.
insert into res select 'conta_nome', public.api_criar_reserva('00000000-0000-0000-0000-00000c1e0a00',
  '00000000-0000-0000-0000-00000c1e0901',
  (select jsonb_set(pedido, '{cliente,nif}', '"213456788"') || '{"referencia_externa": "conta-005"}'::jsonb from q),
  '00000000-0000-0000-0000-00000c1e0101');
insert into res select 'sem_ficha', public.api_criar_reserva('00000000-0000-0000-0000-00000c1e0a00',
  '00000000-0000-0000-0000-00000c1e0901',
  (select pedido || '{"referencia_externa": "conta-002"}'::jsonb from q),
  '00000000-0000-0000-0000-00000c1e0111');

select ok((select r.cliente_id = '00000000-0000-0000-0000-00000c1e0f05' and r.cliente_nome = 'Ana Ficha' and r.origem = 'site'
             from public.reservas r where r.id = (select (r->>'id')::uuid from res where nome = 'conta')),
  'com a conta ligada a reserva é da ficha da conta, sem procura por NIF/email');
select ok((select r.dados_site->>'cliente_divergente' = 'true'
             from public.reservas r where r.id = (select (r->>'id')::uuid from res where nome = 'conta')),
  'com a conta, nome (e NIF) do pedido diferentes da ficha: cliente_divergente');
select ok(exists (select 1 from public.domain_events
                   where entity_id = (select (r->>'id')::uuid from res where nome = 'conta')
                     and event_type = 'reserva.site_recebida'
                     and (payload->>'cliente_divergente')::boolean
                     and payload->>'mensagem' like '%confirmar identidade ao balcão%'),
  'a equipa é avisada da divergência no evento');
select ok((select r.cliente_id = '00000000-0000-0000-0000-00000c1e0f05' and r.dados_site->>'cliente_divergente' = 'false'
             from public.reservas r where r.id = (select (r->>'id')::uuid from res where nome = 'conta_igual')),
  'com a conta, nome e NIF iguais aos da ficha: não diverge');
select ok((select r.cliente_id = '00000000-0000-0000-0000-00000c1e0f05' and r.dados_site->>'cliente_divergente' = 'true'
             from public.reservas r where r.id = (select (r->>'id')::uuid from res where nome = 'conta_nif')),
  'com a conta, mesmo nome mas NIF diferente do da ficha: cliente_divergente');
select ok(exists (select 1 from public.reserva_condutores
                   where reserva_id = (select (r->>'id')::uuid from res where nome = 'conta')
                     and cliente_id = '00000000-0000-0000-0000-00000c1e0f05' and is_principal),
  'condutor principal é a ficha da conta');
select ok((select r.cliente_id <> '00000000-0000-0000-0000-00000c1e0f07' and c.user_id is null and c.nif = '234567899'
             from public.reservas r join public.clientes c on c.id = r.cliente_id
            where r.id = (select (r->>'id')::uuid from res where nome = 'sem_ficha')),
  'conta sem ficha ligada: reserva como anónima; o NIF do Bruno (ficha ligada a uma conta) não a põe na ficha dele');
select ok((select r.cliente_id = '00000000-0000-0000-0000-00000c1e0f05' and r.dados_site->>'cliente_divergente' = 'true'
             from public.reservas r where r.id = (select (r->>'id')::uuid from res where nome = 'conta_nome')),
  'com a conta, nome diferente e NIF igual ao da ficha: cliente_divergente');
select is((select count(*)::int from public.clientes where org_id = '00000000-0000-0000-0000-00000c1e0a00'),
  (select n + 1 from n0), 'só a reserva da conta sem ficha cria uma ficha (o NIF da ficha ligada do Bruno já não serve)');

-- Sem conta, com o NIF (posto à mão em 10d) ou o email da ficha do registo do Nuno.
insert into res select 'anon_nif', public.api_criar_reserva('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0901',
  (select jsonb_set(jsonb_set(pedido, '{cliente,nif}', '"245678905"'), '{cliente,email}', '"anon.nif@contacli.pt"')
          || '{"referencia_externa": "anon-001"}'::jsonb from q));
insert into res select 'anon_email', public.api_criar_reserva('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0901',
  (select jsonb_set(pedido #- '{cliente,nif}', '{cliente,email}', '"novo@contacli.pt"')
          || '{"referencia_externa": "anon-002"}'::jsonb from q));
select ok((select r.cliente_id <> (select id from public.clientes where user_id = '00000000-0000-0000-0000-00000c1e0102')
             from public.reservas r where r.id = (select (r->>'id')::uuid from res where nome = 'anon_nif')),
  'reserva anónima com o NIF de uma ficha criada no registo: não cai nessa ficha');
select ok((select r.cliente_id <> (select id from public.clientes where user_id = '00000000-0000-0000-0000-00000c1e0102')
                  and c.created_by is null and c.user_id is null and c.email = 'novo@contacli.pt'
             from public.reservas r join public.clientes c on c.id = r.cliente_id
            where r.id = (select (r->>'id')::uuid from res where nome = 'anon_email')),
  'reserva anónima com o email de uma ficha criada no registo: não cai nessa ficha (nasce outra)');
select ok(not exists (
            select 1 from jsonb_array_elements(public.api_conta_reservas('00000000-0000-0000-0000-00000c1e0a00',
                                                                         '00000000-0000-0000-0000-00000c1e0102')) x
             where (x->>'codigo')::bigint in (select (r->>'codigo')::bigint from res where nome in ('anon_nif', 'anon_email'))),
  'e a conta do registo não vê as reservas anónimas');
select ok((select (r->>'codigo')::bigint from res where nome = 'conta') in (
            select (x->>'codigo')::bigint from jsonb_array_elements(public.api_conta_reservas(
              '00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101')) x),
  'a reserva feita com a conta aparece na conta');

-- ── 11b. Ficha da equipa com created_by apagado; fichas ligadas a contas ──
-- f20: da equipa, created_by posto a null (colaborador apagado). f21: do registo
-- sem conta. Período mais tarde (o máximo da API são 15 dias): os carros do período anterior estão todos tomados.
insert into public.clientes (id, org_id, nome, email, nif, tipo_cliente, created_by) values
  ('00000000-0000-0000-0000-00000c1e0f20', '00000000-0000-0000-0000-00000c1e0a00', 'Eva Equipa', 'eva@contacli.pt', '123456789', 'particular', null),
  ('00000000-0000-0000-0000-00000c1e0f21', '00000000-0000-0000-0000-00000c1e0a00', 'Rita Registo', 'rita@contacli.pt', '200000004', 'particular', null);
update public.clientes set criada_no_registo = true where id = '00000000-0000-0000-0000-00000c1e0f21';

create temp table q2 as select jsonb_build_object(
  'modelo_id', '00000000-0000-0000-0000-00000c1e0d02',
  'inicio', (select inicio + interval '9 days' from p), 'fim', (select fim + interval '9 days' from p),
  'entrega', '00000000-0000-0000-0000-00000c1e0501', 'recolha', '00000000-0000-0000-0000-00000c1e0501',
  'extras', '[]'::jsonb,
  'cliente', jsonb_build_object('nome', 'Nome do Site', 'email', 'site2@contacli.pt', 'telefone', '+351912345678',
                                'data_nascimento', '1990-05-01', 'pais', 'Portugal'),
  'carta_conducao', jsonb_build_object('numero', 'L-555', 'validade', '2030-01-01', 'pais', 'Portugal'),
  'total_esperado', (public.api_cotacao('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0d02',
     (select inicio + interval '9 days' from p), (select fim + interval '9 days' from p),
     '00000000-0000-0000-0000-00000c1e0501', '00000000-0000-0000-0000-00000c1e0501', '[]'::jsonb)->'subtotal'->>'com_iva')::numeric) as pedido;
grant select on q2 to public;

-- Anónimas: o NIF/email de uma ficha da equipa sem conta (mesmo com created_by null) liga; o de uma ficha do registo não.
insert into res select 'eva_nif', public.api_criar_reserva('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0901',
  (select jsonb_set(pedido, '{cliente,nif}', '"123456789"') || '{"referencia_externa": "b-001"}'::jsonb from q2));
insert into res select 'eva_email', public.api_criar_reserva('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0901',
  (select jsonb_set(pedido, '{cliente,email}', '"eva@contacli.pt"') || '{"referencia_externa": "b-002"}'::jsonb from q2));
insert into res select 'rita_nif', public.api_criar_reserva('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0901',
  (select jsonb_set(pedido, '{cliente,nif}', '"200000004"') || '{"referencia_externa": "b-003"}'::jsonb from q2));
insert into res select 'rita_email', public.api_criar_reserva('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0901',
  (select jsonb_set(pedido, '{cliente,email}', '"rita@contacli.pt"') || '{"referencia_externa": "b-004"}'::jsonb from q2));
select ok((select r.cliente_id = '00000000-0000-0000-0000-00000c1e0f20' from public.reservas r
            where r.id = (select (r->>'id')::uuid from res where nome = 'eva_nif')),
  'reserva anónima com o NIF de uma ficha da equipa sem conta (created_by null): usa essa ficha');
select ok((select r.cliente_id = '00000000-0000-0000-0000-00000c1e0f20' from public.reservas r
            where r.id = (select (r->>'id')::uuid from res where nome = 'eva_email')),
  'reserva anónima com o email de uma ficha da equipa sem conta (created_by null): usa essa ficha');
select ok((select r.cliente_id <> '00000000-0000-0000-0000-00000c1e0f21' from public.reservas r
            where r.id = (select (r->>'id')::uuid from res where nome = 'rita_nif')),
  'reserva anónima com o NIF de uma ficha do registo sem conta: não cai nessa ficha');
select ok((select r.cliente_id <> '00000000-0000-0000-0000-00000c1e0f21' from public.reservas r
            where r.id = (select (r->>'id')::uuid from res where nome = 'rita_email')),
  'reserva anónima com o email de uma ficha do registo sem conta: não cai nessa ficha');

-- A Eva regista-se: a ficha da equipa (created_by null) é candidata e liga.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000c1e0120', 'eva@contacli.pt', now(),
   jsonb_build_object('tipo_utilizador', 'cliente', 'org_id', '00000000-0000-0000-0000-00000c1e0a00', 'nome', 'Eva Conta'));
select ok((select user_id = '00000000-0000-0000-0000-00000c1e0120' and not criada_no_registo
             from public.clientes where id = '00000000-0000-0000-0000-00000c1e0f20')
          and (select count(*) = 1 from public.clientes where org_id = '00000000-0000-0000-0000-00000c1e0a00' and lower(email) = 'eva@contacli.pt'),
  'ficha da equipa com created_by a null continua candidata: liga à Eva, sem ficha nova');

-- Agora que as fichas estão ligadas a contas, o NIF/email delas não prova nada.
insert into res select 'eva_ligada', public.api_criar_reserva('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0901',
  (select jsonb_set(pedido, '{cliente,nif}', '"123456789"') || '{"referencia_externa": "b-005"}'::jsonb from q2));
insert into res select 'ana_nif', public.api_criar_reserva('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0901',
  (select jsonb_set(pedido, '{cliente,nif}', '"213456788"') || '{"referencia_externa": "b-006"}'::jsonb from q2));
insert into res select 'bruno_email', public.api_criar_reserva('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0901',
  (select jsonb_set(pedido, '{cliente,email}', '"bruno@contacli.pt"') || '{"referencia_externa": "b-007"}'::jsonb from q2));
select ok((select r.cliente_id <> '00000000-0000-0000-0000-00000c1e0f20' and c.user_id is null
             from public.reservas r join public.clientes c on c.id = r.cliente_id
            where r.id = (select (r->>'id')::uuid from res where nome = 'eva_ligada')),
  'reserva anónima com o NIF de uma ficha da equipa ligada à conta da Eva: nasce outra ficha');
select ok((select r.cliente_id <> '00000000-0000-0000-0000-00000c1e0f05' and c.user_id is null
             from public.reservas r join public.clientes c on c.id = r.cliente_id
            where r.id = (select (r->>'id')::uuid from res where nome = 'ana_nif')),
  'reserva anónima com o NIF da Ana (ficha da equipa ligada à conta dela): nasce outra ficha');
select ok((select r.cliente_id <> '00000000-0000-0000-0000-00000c1e0f07' and c.user_id is null
             from public.reservas r join public.clientes c on c.id = r.cliente_id
            where r.id = (select (r->>'id')::uuid from res where nome = 'bruno_email')),
  'reserva anónima com o email do Bruno (ficha da equipa ligada à conta dele): nasce outra ficha');
select ok(not exists (
            select 1 from jsonb_array_elements(public.api_conta_reservas('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0101')) x
             where (x->>'codigo')::bigint = (select (r->>'codigo')::bigint from res where nome = 'ana_nif'))
          and not exists (
            select 1 from jsonb_array_elements(public.api_conta_reservas('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0114')) x
             where (x->>'codigo')::bigint = (select (r->>'codigo')::bigint from res where nome = 'bruno_email'))
          and not exists (
            select 1 from jsonb_array_elements(public.api_conta_reservas('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0120')) x
             where (x->>'codigo')::bigint = (select (r->>'codigo')::bigint from res where nome = 'eva_ligada')),
  'as contas da Ana, do Bruno e da Eva não vêem as reservas anónimas');

-- ── 12. Permissões das chaves ───────────────────────────────────────────────
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000c1e0110', 'admin@contacli.pt');
insert into public.user_organizacoes (user_id, org_id, is_admin) values
  ('00000000-0000-0000-0000-00000c1e0110', '00000000-0000-0000-0000-00000c1e0a00', true)
  on conflict (user_id, org_id) do update set is_admin = true;
insert into public.user_org_ativa (user_id, org_id) values
  ('00000000-0000-0000-0000-00000c1e0110', '00000000-0000-0000-0000-00000c1e0a00')
  on conflict (user_id) do update set org_id = excluded.org_id;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000c1e0110', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000c1e0110","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.api_chaves_criar('Site Conta', 'rent_a_car', array['conta:read', 'conta:write'], null, null) $$,
  'api_chaves_criar aceita conta:read e conta:write');
-- A equipa pela REST: o resto da ficha muda, user_id não (nem num insert).
update public.clientes set user_id = null, criada_no_registo = true, nome = 'Ana Ficha Editada' where id = '00000000-0000-0000-0000-00000c1e0f05';
insert into public.clientes (org_id, nome, email, tipo_cliente, user_id, criada_no_registo) values
  ('00000000-0000-0000-0000-00000c1e0a00', 'Inserida pela REST', 'rest@contacli.pt', 'particular', '00000000-0000-0000-0000-00000c1e0107', true);
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
select ok((select user_id = '00000000-0000-0000-0000-00000c1e0101' and nome = 'Ana Ficha Editada' from public.clientes where id = '00000000-0000-0000-0000-00000c1e0f05'),
  'admin da org pela REST: edita a ficha, mas user_id não muda');
select ok((select user_id is null from public.clientes where email = 'rest@contacli.pt'),
  'nem fica numa ficha inserida pela REST');
select ok((select not criada_no_registo from public.clientes where id = '00000000-0000-0000-0000-00000c1e0f05')
          and (select not criada_no_registo from public.clientes where email = 'rest@contacli.pt'),
  'criada_no_registo também só o servidor a escreve (nem por update nem por insert da REST)');

-- ── 12b. tipo_utilizador cliente: só o servidor passa de ou para ele ────────
-- 0121 a 0124: contas de equipa criadas pelo servidor (org A, membership), como
-- a edge create-user. 0121 é a que um admin ensaiaria como 'cliente' com a
-- ficha da Yara; 0123 e 0124 ficam 'cliente' por SQL (superuser) para provar a
-- guarda da própria ligação.
insert into public.clientes (id, org_id, nome, email, tipo_cliente, created_by) values
  ('00000000-0000-0000-0000-00000c1e0f22', '00000000-0000-0000-0000-00000c1e0a00', 'Yara Ficha', 'yara@contacli.pt', 'particular', '00000000-0000-0000-0000-00000c1e02ff'),
  ('00000000-0000-0000-0000-00000c1e0f23', '00000000-0000-0000-0000-00000c1e0a00', 'Zoe Ficha', 'zoe@contacli.pt', 'particular', '00000000-0000-0000-0000-00000c1e02ff'),
  ('00000000-0000-0000-0000-00000c1e0f24', '00000000-0000-0000-0000-00000c1e0a00', 'Ivo Ficha', 'ivo@contacli.pt', 'particular', '00000000-0000-0000-0000-00000c1e02ff');
insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000c1e0121', 'yara@contacli.pt', now(), jsonb_build_object('org_id', '00000000-0000-0000-0000-00000c1e0a00')),
  ('00000000-0000-0000-0000-00000c1e0122', 'colab2@contacli.pt', now(), jsonb_build_object('org_id', '00000000-0000-0000-0000-00000c1e0a00')),
  ('00000000-0000-0000-0000-00000c1e0123', 'zoe@contacli.pt', now(), jsonb_build_object('org_id', '00000000-0000-0000-0000-00000c1e0a00')),
  ('00000000-0000-0000-0000-00000c1e0124', 'forcado@contacli.pt', now(), jsonb_build_object('org_id', '00000000-0000-0000-0000-00000c1e0a00')),
  ('00000000-0000-0000-0000-00000c1e0125', 'ivo@contacli.pt', now(), jsonb_build_object('org_id', '00000000-0000-0000-0000-00000c1e0a00'));
update public.profiles set tipo_utilizador = 'cliente' where id = '00000000-0000-0000-0000-00000c1e0124';
select ok((select count(*) = 5 and bool_and(org_id = '00000000-0000-0000-0000-00000c1e0a00') from public.profiles
            where id in ('00000000-0000-0000-0000-00000c1e0121', '00000000-0000-0000-0000-00000c1e0122',
                         '00000000-0000-0000-0000-00000c1e0123', '00000000-0000-0000-0000-00000c1e0124',
                         '00000000-0000-0000-0000-00000c1e0125')),
  'fixture: contas criadas pelo servidor, com organização');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000c1e0110', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000c1e0110","role":"authenticated"}', true);
update public.profiles set tipo_utilizador = 'cliente' where id = '00000000-0000-0000-0000-00000c1e0121';
update public.profiles set tipo_utilizador = 'colaborador' where id = '00000000-0000-0000-0000-00000c1e0124';
update public.profiles set tipo_utilizador = 'motorista' where id = '00000000-0000-0000-0000-00000c1e0122';
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
select ok((select tipo_utilizador = 'colaborador' from public.profiles where id = '00000000-0000-0000-0000-00000c1e0121'),
  'admin da org pela REST: não passa uma conta a cliente');
select ok((select tipo_utilizador = 'cliente' from public.profiles where id = '00000000-0000-0000-0000-00000c1e0124'),
  'admin da org pela REST: não tira o tipo cliente a uma conta');
select ok((select tipo_utilizador = 'motorista' from public.profiles where id = '00000000-0000-0000-0000-00000c1e0122'),
  'motorista e colaborador continuam a mudar pela REST (colaborador para motorista)');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000c1e0110', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000c1e0110","role":"authenticated"}', true);
update public.profiles set tipo_utilizador = 'colaborador' where id = '00000000-0000-0000-0000-00000c1e0122';
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
select ok((select tipo_utilizador = 'colaborador' from public.profiles where id = '00000000-0000-0000-0000-00000c1e0122'),
  'e de motorista para colaborador');

-- Mesmo com o tipo a cliente posto por SQL, org ou membership impedem a ligação.
update public.profiles set tipo_utilizador = 'cliente' where id in ('00000000-0000-0000-0000-00000c1e0121', '00000000-0000-0000-0000-00000c1e0123');
update public.profiles set org_id = null where id = '00000000-0000-0000-0000-00000c1e0123';
-- 0125: org no profile, sem membership.
update public.profiles set tipo_utilizador = 'cliente' where id = '00000000-0000-0000-0000-00000c1e0125';
delete from public.user_organizacoes where user_id = '00000000-0000-0000-0000-00000c1e0125';
select ok(public.cliente_ligar_conta('00000000-0000-0000-0000-00000c1e0121', '00000000-0000-0000-0000-00000c1e0a00') is null
          and (select user_id is null from public.clientes where id = '00000000-0000-0000-0000-00000c1e0f22'),
  'conta de cliente com organização no profile: não liga à ficha de outra pessoa');
select ok(public.cliente_ligar_conta('00000000-0000-0000-0000-00000c1e0123', '00000000-0000-0000-0000-00000c1e0a00') is null
          and (select user_id is null from public.clientes where id = '00000000-0000-0000-0000-00000c1e0f23'),
  'conta de cliente sem org no profile mas com membership: não liga');
select ok(public.cliente_ligar_conta('00000000-0000-0000-0000-00000c1e0125', '00000000-0000-0000-0000-00000c1e0a00') is null
          and (select user_id is null from public.clientes where id = '00000000-0000-0000-0000-00000c1e0f24')
          and (select org_id = '00000000-0000-0000-0000-00000c1e0a00' from public.profiles where id = '00000000-0000-0000-0000-00000c1e0125'),
  'conta de cliente com organização no profile e sem membership: não liga');
select ok(public.api_conta('00000000-0000-0000-0000-00000c1e0a00', '00000000-0000-0000-0000-00000c1e0121')->'cliente' = 'null'::jsonb
          and not exists (select 1 from public.clientes where user_id in ('00000000-0000-0000-0000-00000c1e0121', '00000000-0000-0000-0000-00000c1e0123')),
  'nem pela ligação preguiçosa da API');

-- ── 13. Privilégios e volatilidade ──────────────────────────────────────────
create temp table fns as select unnest(array[
  'public.api_conta_cliente_id(uuid,uuid)',
  'public.api_conta(uuid,uuid)',
  'public.api_conta_reserva_resumo(uuid,uuid)',
  'public.api_conta_reservas(uuid,uuid)',
  'public.api_conta_cancelar_reserva(uuid,uuid,bigint)',
  'public.api_conta_faturas(uuid,uuid)',
  'public.api_conta_fatura(uuid,uuid,uuid)',
  'public.api_criar_reserva(uuid,uuid,jsonb,uuid)']) as f;
grant select on fns to public;
select ok(bool_and(not has_function_privilege('anon', f, 'EXECUTE')
                   and not has_function_privilege('authenticated', f, 'EXECUTE')),
  'anon e authenticated não executam as funções da conta nem api_criar_reserva') from fns;
select ok(bool_and(has_function_privilege('service_role', f, 'EXECUTE')),
  'service_role executa as funções da conta e api_criar_reserva') from fns;
select ok(not has_function_privilege('anon', 'public.cliente_ligar_conta(uuid,uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.cliente_ligar_conta(uuid,uuid)', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.cliente_ligar_conta(uuid,uuid)', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.cliente_conta_confirmada()', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.cliente_conta_confirmada()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.clientes_user_id_so_pelo_servidor()', 'EXECUTE')
          and not has_function_privilege('authenticated', 'public.profiles_tipo_cliente_so_pelo_servidor()', 'EXECUTE')
          and not has_function_privilege('service_role', 'public.profiles_tipo_cliente_so_pelo_servidor()', 'EXECUTE')
          and not has_function_privilege('anon', 'public.profiles_tipo_cliente_so_pelo_servidor()', 'EXECUTE'),
  'a ligação conta-ficha só corre pelos triggers e pelas funções da conta');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'api_criar_reserva'),
  1, 'só existe uma api_criar_reserva (a de 3 argumentos saiu)');
select ok((select bool_and(p.proconfig @> array['search_path=""'])
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('cliente_ligar_conta', 'cliente_conta_confirmada', 'clientes_user_id_so_pelo_servidor',
                                'profiles_tipo_cliente_so_pelo_servidor',
                                'api_conta_cliente_id', 'api_conta',
                                'api_conta_reserva_resumo', 'api_conta_reservas', 'api_conta_cancelar_reserva',
                                'api_conta_faturas', 'api_conta_fatura')),
  'funções novas com search_path fixo e vazio');
select ok((select bool_and(p.provolatile = 'v')
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public'
              and p.proname in ('api_conta_cliente_id', 'api_conta', 'api_conta_reservas', 'api_conta_cancelar_reserva',
                                'api_conta_faturas', 'api_conta_fatura', 'api_criar_reserva')),
  'as funções que podem ligar a ficha são VOLATILE');

select * from finish();
rollback;
