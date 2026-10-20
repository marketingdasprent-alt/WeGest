-- ============================================================
-- Reenvio do formulário junta-se ao lead existente (pgTAP)
-- ============================================================
-- A Nara Lamberty enviou o formulário às 09:42 e às 09:44 de 2026-10-20 e
-- ficou com dois leads. A migração 20261020150000 junta o segundo envio ao
-- primeiro quando o email ou o telefone já deram lead na org nas últimas 24 h.
-- ============================================================

begin;
select plan(10);

-- O webhook externo não tem nada a ver com este teste.
alter table public.leads_dasprent disable trigger "Lead Distância";

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000004a0000', 'Org Leads Reenvio', 'leads-reenvio-teste'),
  ('00000000-0000-0000-0000-0000004a0001', 'Org Leads Outra', 'leads-reenvio-outra');

insert into public.formularios (id, org_id, nome) values
  ('00000000-0000-0000-0000-0000004af001', '00000000-0000-0000-0000-0000004a0000', 'TVDE Geral'),
  ('00000000-0000-0000-0000-0000004af002', '00000000-0000-0000-0000-0000004a0001', 'TVDE Geral');

create temp table org_teste as select '00000000-0000-0000-0000-0000004a0000'::uuid as id;

-- 1. Primeiro envio entra.
insert into public.leads_dasprent (org_id, formulario_id, nome, email, telefone, observacoes, campaign_tags)
values ('00000000-0000-0000-0000-0000004a0000', '00000000-0000-0000-0000-0000004af001',
        'Nara Lamberty', 'nara@example.com', '+351 910724745',
        '{"nomeCompleto":{"label":"Nome Completo","value":"Nara Lamberty","type":"text"},'
        '"email":{"label":"Email","value":"nara@example.com","type":"email"},'
        '"observacoes":{"label":"Observações","value":"Quero trocar de carro","type":"textarea"}}',
        array['TVDE GERAL']);

-- 2. Segundo envio: mesmo email noutra grafia, outra mensagem, outra campanha.
insert into public.leads_dasprent (org_id, formulario_id, nome, email, telefone, observacoes, campaign_tags)
values ('00000000-0000-0000-0000-0000004a0000', '00000000-0000-0000-0000-0000004af001',
        'Nara Lamberty', ' Nara@Example.com', '+351 910724745',
        '{"nomeCompleto":{"label":"Nome Completo","value":"Nara Lamberty","type":"text"},'
        '"email":{"label":"Email","value":"nara@example.com","type":"email"},'
        '"telefone":{"label":"Telefone","value":"+351 910724745","type":"tel"},'
        '"observacoes":{"label":"Observações","value":"Quero Tesla 2023 ou 24.","type":"textarea"}}',
        array['SLOT']);

select is(
  (select count(*)::int from public.leads_dasprent where org_id = (select id from org_teste)),
  1,
  'reenvio do mesmo contacto não cria lead novo'
);

select matches(
  (select observacoes_gestores from public.leads_dasprent where org_id = (select id from org_teste)),
  'Voltou a enviar o formulário a .*\nObservações: Quero Tesla 2023 ou 24\.',
  'as respostas novas ficam nas notas dos gestores'
);

select doesnt_match(
  (select observacoes_gestores from public.leads_dasprent where org_id = (select id from org_teste)),
  'nara@example\.com|910724745|Nome Completo',
  'nome, email e telefone não se repetem nas notas'
);

select is(
  (select campaign_tags from public.leads_dasprent where org_id = (select id from org_teste)),
  array['SLOT', 'TVDE GERAL'],
  'as campanhas somam-se'
);

-- 3. Mesmo telefone noutro formato e outro email: o telefone chega.
insert into public.leads_dasprent (org_id, formulario_id, nome, email, telefone, observacoes)
values ('00000000-0000-0000-0000-0000004a0000', '00000000-0000-0000-0000-0000004af001',
        'Nara', 'outro@example.com', '00351 910 724 745', 'texto simples da landing');

select is(
  (select count(*)::int from public.leads_dasprent where org_id = (select id from org_teste)),
  1,
  'mesmo telefone noutro formato junta ao mesmo lead'
);

select matches(
  (select observacoes_gestores from public.leads_dasprent where org_id = (select id from org_teste)),
  'texto simples da landing',
  'observações em texto simples também ficam nas notas'
);

-- 4. Outra org: o mesmo contacto é lead novo.
insert into public.leads_dasprent (org_id, formulario_id, nome, email, telefone)
values ('00000000-0000-0000-0000-0000004a0001', '00000000-0000-0000-0000-0000004af002',
        'Nara Lamberty', 'nara@example.com', '+351 910724745');

select is(
  (select count(*)::int from public.leads_dasprent where org_id = '00000000-0000-0000-0000-0000004a0001'),
  1,
  'noutra org o mesmo contacto entra como lead novo'
);

-- 5. Passadas 24 h entra lead novo.
update public.leads_dasprent set created_at = now() - interval '25 hours'
 where org_id = (select id from org_teste);

insert into public.leads_dasprent (org_id, formulario_id, nome, email, telefone)
values ('00000000-0000-0000-0000-0000004a0000', '00000000-0000-0000-0000-0000004af001',
        'Nara Lamberty', 'nara@example.com', '+351 910724745');

select is(
  (select count(*)::int from public.leads_dasprent where org_id = (select id from org_teste)),
  2,
  'passadas 24 h o reenvio é lead novo'
);

-- 6. Lead criado pela equipa (sem formulário): entra mesmo repetido.
insert into public.leads_dasprent (org_id, nome, email, telefone)
values ('00000000-0000-0000-0000-0000004a0000', 'Nara Lamberty', 'nara@example.com', '+351 910724745');

select is(
  (select count(*)::int from public.leads_dasprent where org_id = (select id from org_teste)),
  3,
  'lead criado pela equipa ou importado não é juntado'
);

-- 7. Visitante anónimo sem formulario_id (landing): junta.
select set_config('request.jwt.claims', '{"role":"anon"}', true);

insert into public.leads_dasprent (org_id, nome, email, telefone, observacoes)
values ('00000000-0000-0000-0000-0000004a0000', 'Nara Lamberty', 'nara@example.com', '910724745',
        'Tipo: Aluguer');

select is(
  (select count(*)::int from public.leads_dasprent where org_id = (select id from org_teste)),
  3,
  'envio anónimo da landing também junta'
);

select * from finish();
rollback;
