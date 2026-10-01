-- Fotos da viatura: máximo de 8, ordem automática, reordenar e capa.
-- Corre com: supabase start && supabase test db

begin;
select plan(9);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000f0000', 'Org Fotos', 'fotos-a');
insert into public.viatura_marcas (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000000f0aa1', '00000000-0000-0000-0000-0000000f0000', 'Peugeot');
insert into public.viatura_modelos (id, org_id, marca_id, nome) values
  ('00000000-0000-0000-0000-0000000f0ab1', '00000000-0000-0000-0000-0000000f0000',
   '00000000-0000-0000-0000-0000000f0aa1', '308');
insert into public.viaturas (id, org_id, matricula, marca_id, modelo_id) values
  ('00000000-0000-0000-0000-0000000f0ae1', '00000000-0000-0000-0000-0000000f0000', 'FT-01-AA',
   '00000000-0000-0000-0000-0000000f0aa1', '00000000-0000-0000-0000-0000000f0ab1');

-- 8 fotos, sem ordem explícita: o trigger põe cada uma no fim.
insert into public.viatura_documentos (id, org_id, viatura_id, tipo_documento, ficheiro_url)
select ('00000000-0000-0000-0000-0000000f010' || n)::uuid,
       '00000000-0000-0000-0000-0000000f0000',
       '00000000-0000-0000-0000-0000000f0ae1',
       'foto',
       'v/fotos/' || n || '.jpg'
  from generate_series(1, 8) n;

-- 1-2. Ordem automática 0..7, pela ordem de entrada.
select is(
  (select array_agg(ordem order by ficheiro_url) from public.viatura_documentos
    where viatura_id = '00000000-0000-0000-0000-0000000f0ae1' and tipo_documento = 'foto'),
  array[0, 1, 2, 3, 4, 5, 6, 7],
  'cada foto nova vai para o fim da sequência'
);
select is(
  (select ficheiro_url from public.viatura_capas
    where viatura_id = '00000000-0000-0000-0000-0000000f0ae1'),
  'v/fotos/1.jpg',
  'a capa é a primeira da sequência'
);

-- 3. A 9.ª é recusada pela base.
select throws_ok(
  $$ insert into public.viatura_documentos (org_id, viatura_id, tipo_documento, ficheiro_url)
     values ('00000000-0000-0000-0000-0000000f0000', '00000000-0000-0000-0000-0000000f0ae1',
             'foto', 'v/fotos/9.jpg') $$,
  'P0001',
  'Esta viatura já tem 8 fotos, o máximo permitido.',
  'não passa das 8 fotos'
);

-- 4. Outros documentos da viatura não contam para o limite.
select lives_ok(
  $$ insert into public.viatura_documentos (org_id, viatura_id, tipo_documento, ficheiro_url)
     values ('00000000-0000-0000-0000-0000000f0000', '00000000-0000-0000-0000-0000000f0ae1',
             'ipo', 'v/ipo.pdf') $$,
  'um IPO não conta como foto'
);

-- 5. Mudar um documento qualquer para foto também respeita o limite.
select throws_ok(
  $$ update public.viatura_documentos set tipo_documento = 'foto'
      where ficheiro_url = 'v/ipo.pdf' $$,
  'P0001',
  null,
  'converter para foto também respeita o limite'
);

-- 6-7. Reordenar: a última passa a primeira (= capa).
select lives_ok(
  $$ select public.reordenar_fotos_viatura(
       '00000000-0000-0000-0000-0000000f0ae1',
       array[
         '00000000-0000-0000-0000-0000000f0108', '00000000-0000-0000-0000-0000000f0101',
         '00000000-0000-0000-0000-0000000f0102', '00000000-0000-0000-0000-0000000f0103',
         '00000000-0000-0000-0000-0000000f0104', '00000000-0000-0000-0000-0000000f0105',
         '00000000-0000-0000-0000-0000000f0106', '00000000-0000-0000-0000-0000000f0107'
       ]::uuid[]) $$,
  'reordenar corre'
);
select is(
  (select ficheiro_url from public.viatura_capas
    where viatura_id = '00000000-0000-0000-0000-0000000f0ae1'),
  'v/fotos/8.jpg',
  'depois de arrastar a última para primeiro, ela é a capa'
);

-- 8. Apagar a capa promove a seguinte.
delete from public.viatura_documentos where id = '00000000-0000-0000-0000-0000000f0108';
select is(
  (select ficheiro_url from public.viatura_capas
    where viatura_id = '00000000-0000-0000-0000-0000000f0ae1'),
  'v/fotos/1.jpg',
  'sem a capa, a seguinte passa a capa'
);

-- 9. Com uma vaga, volta a aceitar — no fim.
insert into public.viatura_documentos (org_id, viatura_id, tipo_documento, ficheiro_url)
values ('00000000-0000-0000-0000-0000000f0000', '00000000-0000-0000-0000-0000000f0ae1',
        'foto', 'v/fotos/nova.jpg');
select is(
  (select ordem from public.viatura_documentos where ficheiro_url = 'v/fotos/nova.jpg'),
  8,
  'a foto nova entra depois da maior ordem existente'
);

select * from finish();
rollback;
