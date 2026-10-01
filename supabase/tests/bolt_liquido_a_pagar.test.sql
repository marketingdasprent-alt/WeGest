-- ============================================================
-- "liquido_a_pagar soma os extras do CSV só quando o líquido veio da API" (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- liquido_a_pagar é o que se paga ao motorista pela Bolt. A regra depende de
-- QUEM escreveu ganhos_liquidos:
--
--   fonte_viagens = 'api'  → a API escreveu o líquido e não conhece campanhas;
--                            soma-se ganhos_campanha + reembolsos_despesas.
--   fonte_viagens = 'csv'  → o CSV escreveu o líquido, que JÁ inclui campanhas
--   fonte_viagens IS NULL    (bruto_total − total_taxas, e o bruto_total traz a
--                            campanha). Somar outra vez duplica: foi o que a
--                            migração 20260915170000 fez à Bolt Lara — João
--                            Fonseca, campanha 145, líquido 556,87 → 701,87.
--
-- O teste das gorjetas continua a ser o mais importante: já estão dentro do
-- líquido nos dois lados; somá-las duplicava-as.
-- ============================================================

begin;
select plan(7);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-000000180000', 'Org Liquido A Pagar', 'lap-a');

insert into public.plataformas_configuracao (id, org_id, plataforma, nome, robot_target_platform) values
  ('00000000-0000-0000-0000-000000180b01', '00000000-0000-0000-0000-000000180000',
   'robot', 'Bolt Liquido Test', 'bolt');

-- viagens_terminadas > 0: o trigger fn_bolt_recusa_ganhos_sem_atividade trava
-- ganhos sem actividade nenhuma (assinatura de CSV da semana errada).
insert into public.bolt_resumos_semanais
  (org_id, integracao_id, periodo, periodo_inicio, periodo_fim, chave_motorista, motorista_nome,
   fonte_viagens, ganhos_liquidos, ganhos_campanha, reembolsos_despesas, gorjetas, viagens_terminadas)
values
  -- Líquido da API: não tem a campanha, soma-se.
  ('00000000-0000-0000-0000-000000180000', '00000000-0000-0000-0000-000000180b01',
   '2026-09-07 a 2026-09-13', '2026-09-07', '2026-09-13', 'lap-api-com-campanha',
   'API Com Campanha', 'api', 100.00, 15.00, 2.00, 10.00, 12),
  ('00000000-0000-0000-0000-000000180000', '00000000-0000-0000-0000-000000180b01',
   '2026-09-07 a 2026-09-13', '2026-09-07', '2026-09-13', 'lap-api-sem-campanha',
   'API Sem Campanha', 'api', 80.00, null, null, 5.00, 9),
  -- Líquido do CSV (integração em password): a campanha já está lá dentro.
  ('00000000-0000-0000-0000-000000180000', '00000000-0000-0000-0000-000000180b01',
   '2026-09-07 a 2026-09-13', '2026-09-07', '2026-09-13', 'lap-csv-com-campanha',
   'CSV Com Campanha', 'csv', 556.87, 145.00, 0.00, 3.00, 40),
  -- Legado: upsert directo antigo, sem fonte carimbada — também veio do CSV.
  ('00000000-0000-0000-0000-000000180000', '00000000-0000-0000-0000-000000180b01',
   '2026-09-07 a 2026-09-13', '2026-09-07', '2026-09-13', 'lap-legado-com-campanha',
   'Legado Com Campanha', null, 179.36, 20.00, 0.00, 1.00, 15);

-- 1. Líquido da API: soma campanha e reembolsos.
select is(
  (select liquido_a_pagar from public.bolt_resumos_semanais where chave_motorista = 'lap-api-com-campanha'),
  117.00::numeric,
  'fonte api: liquido_a_pagar = ganhos_liquidos + campanha + reembolsos'
);

-- 2. NÃO soma as gorjetas: 10,00 presentes e o valor é 117, não 127.
select isnt(
  (select liquido_a_pagar from public.bolt_resumos_semanais where chave_motorista = 'lap-api-com-campanha'),
  127.00::numeric,
  'as gorjetas ficam de fora — já estão dentro de ganhos_liquidos'
);

-- 3. Campanha e reembolsos a NULL valem zero.
select is(
  (select liquido_a_pagar from public.bolt_resumos_semanais where chave_motorista = 'lap-api-sem-campanha'),
  80.00::numeric,
  'fonte api sem campanha: liquido_a_pagar é o próprio ganhos_liquidos'
);

-- 4. Líquido do CSV: a campanha JÁ está lá — não se soma outra vez.
select is(
  (select liquido_a_pagar from public.bolt_resumos_semanais where chave_motorista = 'lap-csv-com-campanha'),
  556.87::numeric,
  'fonte csv: liquido_a_pagar = ganhos_liquidos, sem somar a campanha (evita duplicar)'
);

-- 5. Legado sem fonte carimbada veio do CSV antigo: idem.
select is(
  (select liquido_a_pagar from public.bolt_resumos_semanais where chave_motorista = 'lap-legado-com-campanha'),
  179.36::numeric,
  'fonte NULL (upsert antigo): liquido_a_pagar = ganhos_liquidos, sem somar a campanha'
);

-- 6. Recalcula sozinha quando uma parcela muda — é o que impede a
--    sincronização seguinte da API de apagar as campanhas.
update public.bolt_resumos_semanais set ganhos_campanha = 40.00 where chave_motorista = 'lap-api-com-campanha';
select is(
  (select liquido_a_pagar from public.bolt_resumos_semanais where chave_motorista = 'lap-api-com-campanha'),
  142.00::numeric,
  'ao mudar a campanha numa linha da API, liquido_a_pagar recalcula-se'
);

-- 7. Não se escreve à mão.
select throws_ok(
  $$ update public.bolt_resumos_semanais set liquido_a_pagar = 999 where chave_motorista = 'lap-api-com-campanha' $$,
  '428C9',
  'column "liquido_a_pagar" can only be updated to DEFAULT',
  'liquido_a_pagar é gerada — não aceita escrita directa'
);

select * from finish();
rollback;
