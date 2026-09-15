-- ============================================================
-- "Avisa quando uma semana de plataforma não chegou" (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Duas semanas com dados, uma sem. Só a do meio é que gera evento — e gera-o
-- uma vez só, por mais vezes que o cron corra.
-- ============================================================

begin;
select plan(6);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000170000', 'Org Semana Falta', 'sf-a');

insert into public.plataformas_configuracao (id, org_id, plataforma, nome, robot_target_platform, ativo) values
  ('00000000-0000-0000-0000-000000170b01', '00000000-0000-0000-0000-000000170000',
   'robot', 'Uber Semana Falta', 'uber', true);

-- Três semanas seguidas, já fora da tolerância de 3 dias. A do meio fica vazia.
-- uber_resumos_semanais exige chave_motorista e fonte; motorista_id fica nulo
-- porque o trigger resolver_motorista o reescreve a partir do uber_driver_id.
insert into public.uber_resumos_semanais
  (org_id, integracao_id, periodo, periodo_inicio, periodo_fim, chave_motorista, fonte, ganhos_brutos)
values
  ('00000000-0000-0000-0000-000000170000', '00000000-0000-0000-0000-000000170b01',
   'sem-1', (date_trunc('week', now())::date - 28), (date_trunc('week', now())::date - 22),
   'sf-motorista', 'csv', 900),
  ('00000000-0000-0000-0000-000000170000', '00000000-0000-0000-0000-000000170b01',
   'sem-3', (date_trunc('week', now())::date - 14), (date_trunc('week', now())::date - 8),
   'sf-motorista', 'csv', 950);

select public.emit_semanas_plataforma_em_falta_events();

-- 1. A semana do meio é apanhada.
select is(
  (select count(*)::int from public.domain_events
    where event_type = 'plataforma.semana_em_falta'
      and entity_id = '00000000-0000-0000-0000-000000170b01'
      and payload->>'semana_inicio' = (date_trunc('week', now())::date - 21)::text),
  1,
  'a semana sem uma única linha gera evento'
);

-- 2. As semanas com dados não geram nada.
select is(
  (select count(*)::int from public.domain_events
    where event_type = 'plataforma.semana_em_falta'
      and entity_id = '00000000-0000-0000-0000-000000170b01'),
  1,
  'só a semana em falta gera evento — as que têm dados não'
);

-- 3. O evento fica na org certa. Um aviso destes a atravessar organizações
--    seria expor a uma frota os buracos de outra.
select is(
  (select org_id from public.domain_events
    where event_type = 'plataforma.semana_em_falta'
      and entity_id = '00000000-0000-0000-0000-000000170b01'),
  '00000000-0000-0000-0000-000000170000'::uuid,
  'o evento fica na organização da integração'
);

-- 4. Correr outra vez não duplica. É o cron diário: sem isto, a mesma semana
--    avisava todos os dias até alguém a corrigir.
select public.emit_semanas_plataforma_em_falta_events();
select is(
  (select count(*)::int from public.domain_events
    where event_type = 'plataforma.semana_em_falta'
      and entity_id = '00000000-0000-0000-0000-000000170b01'),
  1,
  'correr o cron de novo não emite o mesmo aviso outra vez'
);

-- 5. Uma semana recente ainda não conta. A que acabou de fechar está dentro
--    dos 3 dias de tolerância — o relatório da Uber pode nem existir.
select is(
  (select count(*)::int from public.domain_events
    where event_type = 'plataforma.semana_em_falta'
      and entity_id = '00000000-0000-0000-0000-000000170b01'
      and payload->>'semana_inicio' = (date_trunc('week', now())::date - 7)::text),
  0,
  'a semana que acabou agora ainda não é dada como em falta'
);

-- 6. Uma integração sem histórico nenhum não se queixa. Sem isto, cada
--    integração nova gerava 8 avisos no primeiro dia de vida.
insert into public.plataformas_configuracao (id, org_id, plataforma, nome, robot_target_platform, ativo) values
  ('00000000-0000-0000-0000-000000170b02', '00000000-0000-0000-0000-000000170000',
   'robot', 'Uber Acabada de Criar', 'uber', true);

select public.emit_semanas_plataforma_em_falta_events();
select is(
  (select count(*)::int from public.domain_events
    where event_type = 'plataforma.semana_em_falta'
      and entity_id = '00000000-0000-0000-0000-000000170b02'),
  0,
  'integração sem histórico não reclama das semanas que nunca teve'
);

select * from finish();
rollback;
