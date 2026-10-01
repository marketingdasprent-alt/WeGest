-- ============================================================
-- fn_dividir_email_das_regras herda o grupo_id da regra-mãe (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Sem isto, a gémea de email nasce com um grupo_id ALEATÓRIO próprio (o
-- valor por omissão da coluna) em vez do da regra que a originou — e o
-- construtor de "várias acções por automação" nunca as vê como uma única
-- automação. Ver 20260905090000.
-- ============================================================

begin;
select plan(2);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000090000', 'Org Divisão Grupo', 'divisao-grupo-g');

insert into public.automation_rules (id, org_id, codigo, nome, event_type, acao_tipo, acao_config) values (
  '00000000-0000-0000-0000-000000090001', '00000000-0000-0000-0000-000000090000',
  'zz.teste.divisao_grupo', 'Regra a dividir', 'viatura.seguro_expirando', 'notificacao',
  jsonb_build_object('template_codigo', 'zz-teste', 'titulo', 'Teste',
                     'destinatarios_cargo_ids', jsonb_build_array(), 'enviar_email', true)
);

select public.fn_dividir_email_das_regras('00000000-0000-0000-0000-000000090000');

-- 1. A gémea nasceu.
select isnt(
  (select id from public.automation_rules where codigo = 'zz.teste.divisao_grupo.email' and org_id = '00000000-0000-0000-0000-000000090000'),
  null,
  'a gémea de email nasce'
);

-- 2. E com o MESMO grupo_id da regra-mãe, não um aleatório próprio.
select is(
  (select grupo_id from public.automation_rules where codigo = 'zz.teste.divisao_grupo.email' and org_id = '00000000-0000-0000-0000-000000090000'),
  (select grupo_id from public.automation_rules where id = '00000000-0000-0000-0000-000000090001'),
  'a gémea herda o grupo_id da regra-mãe — são a mesma automação'
);

select * from finish();
rollback;
