-- ============================================================
-- Voltar a importar a mesma semana substitui, nunca soma — pgTAP
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Reproduz a Uber Açores de 28/09: entrou o ficheiro da Urbango; o ficheiro
-- certo tem de tirar as linhas erradas da semana. Ver 20261001160000.
--   (1) Uber: sai da semana o que veio de ficheiro e não está no novo,
--       transacções e resumo semanal;
--   (2) Uber: outra semana, a API e quem está no ficheiro ficam;
--   (3) Bolt: o mesmo, com a API protegida;
--   (4) só o service_role executa.
-- ============================================================

begin;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000001d00ff', 'bootstrap@reimportar.pt');

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000001d0000', 'Org Reimportar', 'ri-a');

insert into public.plataformas_configuracao (id, org_id, nome, plataforma) values
  ('00000000-0000-0000-0000-0000001d0e01', '00000000-0000-0000-0000-0000001d0000', 'Uber Açores', 'uber'),
  ('00000000-0000-0000-0000-0000001d0e02', '00000000-0000-0000-0000-0000001d0000', 'Bolt Açores', 'bolt');

-- Semana 21/09: o "Agnelo" é da Açores; o "Etinatan" entrou pelo ficheiro errado.
-- Semana 14/09: o "Etinatan" não é tocado (outra semana). A linha API também não.
insert into public.uber_transactions
  (org_id, integracao_id, uber_transaction_id, uber_driver_id, gross_amount, occurred_at, fonte) values
  ('00000000-0000-0000-0000-0000001d0000', '00000000-0000-0000-0000-0000001d0e01',
   'agnelo-20260921-20260927', 'agnelo', 200, '2026-09-21 12:00+00', 'csv'),
  ('00000000-0000-0000-0000-0000001d0000', '00000000-0000-0000-0000-0000001d0e01',
   'etinatan-20260921-20260927', 'etinatan', 966.62, '2026-09-21 12:00+00', 'csv'),
  ('00000000-0000-0000-0000-0000001d0000', '00000000-0000-0000-0000-0000001d0e01',
   'etinatan-20260914-20260920', 'etinatan', 300, '2026-09-14 12:00+00', 'csv'),
  ('00000000-0000-0000-0000-0000001d0000', '00000000-0000-0000-0000-0000001d0e01',
   'api-viagem-1', 'outro', 50, '2026-09-22 12:00+00', 'api');

select is(
  (select count(*)::int from public.uber_resumos_semanais
    where integracao_id = '00000000-0000-0000-0000-0000001d0e01' and periodo_inicio = '2026-09-21'),
  3,
  'antes: a semana 21/09 tem o Agnelo, o Etinatan (errado) e a linha API'
);

select is(
  public.uber_substituir_semana_csv('00000000-0000-0000-0000-0000001d0e01', '20260921-20260927', array['agnelo']),
  '{"transacoes": 1, "resumos": 1}'::jsonb,
  'o ficheiro certo tira a transacção e o resumo do Etinatan nessa semana'
);

select is(
  (select array_agg(uber_driver_id order by uber_driver_id) from public.uber_resumos_semanais
    where integracao_id = '00000000-0000-0000-0000-0000001d0e01' and periodo_inicio = '2026-09-21'),
  array['agnelo', 'outro'],
  'ficam o Agnelo (está no ficheiro) e a linha da API'
);

select is(
  (select count(*)::int from public.uber_transactions
    where uber_transaction_id = 'etinatan-20260914-20260920'),
  1,
  'a outra semana não é tocada'
);

select is(
  public.uber_substituir_semana_csv('00000000-0000-0000-0000-0000001d0e01', '20260921-20260927', array['agnelo']),
  '{"transacoes": 0, "resumos": 0}'::jsonb,
  'importar outra vez o mesmo ficheiro não apaga mais nada'
);

-- Bolt: o Pedro saiu do ficheiro novo; o Rui veio da API.
insert into public.bolt_resumos_semanais
  (org_id, integracao_id, periodo, periodo_inicio, periodo_fim, chave_motorista, motorista_nome,
   ganhos_liquidos, viagens_terminadas, api_sincronizado_em) values
  ('00000000-0000-0000-0000-0000001d0000', '00000000-0000-0000-0000-0000001d0e02',
   '2026-09-21 a 2026-09-27', '2026-09-21', '2026-09-27', 'ana', 'Ana', 100, 10, null),
  ('00000000-0000-0000-0000-0000001d0000', '00000000-0000-0000-0000-0000001d0e02',
   '2026-09-21 a 2026-09-27', '2026-09-21', '2026-09-27', 'pedro', 'Pedro', 80, 8, null),
  ('00000000-0000-0000-0000-0000001d0000', '00000000-0000-0000-0000-0000001d0e02',
   '2026-09-21 a 2026-09-27', '2026-09-21', '2026-09-27', 'rui', 'Rui', 90, 9, now());

select is(
  public.bolt_substituir_semana_csv('00000000-0000-0000-0000-0000001d0e02', '2026-09-21 a 2026-09-27', array['ana']),
  1,
  'Bolt: sai quem já não vem no ficheiro'
);

select is(
  (select array_agg(chave_motorista order by chave_motorista) from public.bolt_resumos_semanais
    where integracao_id = '00000000-0000-0000-0000-0000001d0e02'),
  array['ana', 'rui'],
  'Bolt: fica quem está no ficheiro e quem veio da API'
);

select ok(
  not has_function_privilege('authenticated', 'public.uber_substituir_semana_csv(uuid, text, text[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.uber_substituir_semana_csv(uuid, text, text[])', 'EXECUTE'),
  'uber_substituir_semana_csv: só o service_role executa'
);

select ok(
  not has_function_privilege('authenticated', 'public.bolt_substituir_semana_csv(uuid, text, text[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.bolt_substituir_semana_csv(uuid, text, text[])', 'EXECUTE'),
  'bolt_substituir_semana_csv: só o service_role executa'
);

select * from finish();
rollback;
