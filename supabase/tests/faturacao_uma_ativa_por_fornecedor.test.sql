-- ============================================================
-- Faturação: uma integração ativa por empresa e fornecedor
-- (migração 20261013180000_faturacao_uma_ativa_por_fornecedor).
-- Corre com:  supabase start  &&  supabase test db
-- ============================================================
begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f0aff', 'bootstrap@fornecedor.pt');
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000f0a00', 'Org Fornecedor A', 'fornecedor-a');
-- Sem NIF: a tabela valida o NIF por trigger e aqui ele não interessa.
insert into public.clientes (id, org_id, nome, is_emissora) values
  ('00000000-0000-0000-0000-0000000f0e01', '00000000-0000-0000-0000-0000000f0a00', 'Empresa 1', true),
  ('00000000-0000-0000-0000-0000000f0e02', '00000000-0000-0000-0000-0000000f0a00', 'Empresa 2', true);
insert into public.plataformas_configuracao (id, org_id, plataforma, nome, ativo, client_secret, config, emissor_id) values
  ('00000000-0000-0000-0000-0000000f0c01', '00000000-0000-0000-0000-0000000f0a00', 'faturacao', 'KI E1', true, 'ki-e1', '{"provider":"keyinvoice"}', '00000000-0000-0000-0000-0000000f0e01'),
  ('00000000-0000-0000-0000-0000000f0c02', '00000000-0000-0000-0000-0000000f0a00', 'faturacao', 'PV E1', true, 'pva_e1', '{"provider":"primavera"}', '00000000-0000-0000-0000-0000000f0e01'),
  ('00000000-0000-0000-0000-0000000f0c03', '00000000-0000-0000-0000-0000000f0a00', 'faturacao', 'PV E2', true, 'pva_e2', '{"provider":"primavera"}', '00000000-0000-0000-0000-0000000f0e02');

select has_index('public', 'plataformas_configuracao', 'uq_faturacao_ativa_por_emissor_fornecedor', 'índice por fornecedor existe');
select hasnt_index('public', 'plataformas_configuracao', 'uq_faturacao_ativa_por_emissor', 'índice antigo (um por empresa) foi removido');
select is((select count(*)::int from public.plataformas_configuracao
            where emissor_id = '00000000-0000-0000-0000-0000000f0e01' and ativo), 2,
  'a Empresa 1 tem KeyInvoice e Primavera ativos ao mesmo tempo');
select throws_ok(
  $$insert into public.plataformas_configuracao (org_id, plataforma, nome, ativo, client_secret, config, emissor_id)
    values ('00000000-0000-0000-0000-0000000f0a00', 'faturacao', 'KI E1 bis', true, 'ki-e1-bis', '{"provider":"keyinvoice"}', '00000000-0000-0000-0000-0000000f0e01')$$,
  '23505', null, 'segundo KeyInvoice ativo na mesma empresa é recusado');
select throws_ok(
  $$insert into public.plataformas_configuracao (org_id, plataforma, nome, ativo, client_secret, config, emissor_id)
    values ('00000000-0000-0000-0000-0000000f0a00', 'faturacao', 'Sem provider', true, 'ki-e1-sem', '{}', '00000000-0000-0000-0000-0000000f0e01')$$,
  '23505', null, 'linha sem provider conta como KeyInvoice');
select throws_ok(
  $$insert into public.plataformas_configuracao (org_id, plataforma, nome, ativo, client_secret, config, emissor_id)
    values ('00000000-0000-0000-0000-0000000f0a00', 'faturacao', 'PV E1 bis', true, 'pva_e1_bis', '{"provider":"Primavera"}', '00000000-0000-0000-0000-0000000f0e01')$$,
  '23505', null, 'o fornecedor compara-se sem distinguir maiúsculas');
select lives_ok(
  $$insert into public.plataformas_configuracao (org_id, plataforma, nome, ativo, client_secret, config, emissor_id)
    values ('00000000-0000-0000-0000-0000000f0a00', 'faturacao', 'PV E1 inativa', false, 'pva_e1_off', '{"provider":"primavera"}', '00000000-0000-0000-0000-0000000f0e01')$$,
  'uma segunda do mesmo fornecedor, inativa, é aceite');

select * from finish();
rollback;
