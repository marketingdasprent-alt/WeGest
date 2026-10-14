-- Registo de motorista: a conta nunca se liga a uma ficha pelo telefone da
-- metadata (escrito pelo cliente); pelo email continua a ligar.
begin;
select plan(4);

insert into public.organizacoes (id, nome, codigo, ativa) values
  ('00000000-0000-0000-0000-00000007e100', 'Org Telefone', 'signup-tel', true);
insert into public.cargos (id, nome, org_id) values
  ('a0000000-0000-0000-0000-000000000001', 'Motorista', '00000000-0000-0000-0000-00000007e100')
on conflict (id) do nothing;

-- Arranque: consome a vaga do primeiro utilizador da instalação.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000007e1ff', 'bootstrap@signup-tel.pt');

-- f1 sem email e com telefone (a vítima do buraco); f2 com email.
insert into public.motoristas_ativos (id, org_id, nome, telefone, email) values
  ('00000000-0000-0000-0000-00000007e1f1', '00000000-0000-0000-0000-00000007e100', 'Sem Email', '+351 912 000 111', null),
  ('00000000-0000-0000-0000-00000007e1f2', '00000000-0000-0000-0000-00000007e100', 'Com Email', null, 'dono@signup-tel.pt');

-- Registo com o email próprio e o telemóvel de f1.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000007e101', 'outro@signup-tel.pt',
   jsonb_build_object('tipo_utilizador', 'motorista', 'org_id', '00000000-0000-0000-0000-00000007e100',
                      'telefone', '912000111'));

select is((select user_id from public.motoristas_ativos where id = '00000000-0000-0000-0000-00000007e1f1'),
  null, 'o telemóvel de outro motorista na metadata não liga a conta à ficha dele');
select is((select tipo_utilizador from public.profiles where id = '00000000-0000-0000-0000-00000007e101'),
  'motorista', 'o registo continua a criar o perfil de motorista');
select ok(exists (select 1 from public.user_organizacoes
                   where user_id = '00000000-0000-0000-0000-00000007e101'
                     and org_id = '00000000-0000-0000-0000-00000007e100'),
  'e a membership na org escolhida');

-- Registo com o email de f2: liga.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000007e102', 'Dono@Signup-Tel.pt',
   jsonb_build_object('tipo_utilizador', 'motorista', 'org_id', '00000000-0000-0000-0000-00000007e100'));

select is((select user_id from public.motoristas_ativos where id = '00000000-0000-0000-0000-00000007e1f2'),
  '00000000-0000-0000-0000-00000007e102'::uuid, 'pelo email (sem distinguir maiúsculas) continua a ligar');

select * from finish();
rollback;
