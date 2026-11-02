-- ============================================================
-- Bolt: ganhos sem atividade no CSV entram (pgTAP)
-- ============================================================
-- fn_bolt_recusa_ganhos_sem_atividade só recusa a cópia exacta da semana
-- anterior (ficheiro da semana errada), em qualquer conta. 0 viagens,
-- 0 min e 0 km já não bastam para recusar: o relatório pode vir sem atividade.
-- ============================================================

begin;
select plan(3);

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000002b0000', 'Org Bolt Sem Atividade', 'bolt-sem-ativ');

insert into public.plataformas_configuracao (id, org_id, plataforma, nome) values
  ('00000000-0000-0000-0000-0000002b0b01', '00000000-0000-0000-0000-0000002b0000', 'bolt', 'Bolt Sem Atividade');

select lives_ok(
  $$ insert into public.bolt_resumos_semanais
       (org_id, integracao_id, periodo, periodo_inicio, periodo_fim, chave_motorista, motorista_nome, ganhos_liquidos)
     values ('00000000-0000-0000-0000-0000002b0000', '00000000-0000-0000-0000-0000002b0b01',
             '2026-10-26 a 2026-11-01', '2026-10-26', '2026-11-01', 'sem-ativ-1', 'Sem Atividade', 172.86) $$,
  'ganhos sem viagens, minutos nem km são gravados'
);

select is(
  (select ganhos_liquidos from public.bolt_resumos_semanais where chave_motorista = 'sem-ativ-1'),
  172.86::numeric,
  'o valor fica na semana'
);

select throws_like(
  $$ insert into public.bolt_resumos_semanais
       (org_id, integracao_id, periodo, periodo_inicio, periodo_fim, chave_motorista, motorista_nome, ganhos_liquidos)
     values ('00000000-0000-0000-0000-0000002b0000', '00000000-0000-0000-0000-0000002b0b01',
             '2026-11-02 a 2026-11-08', '2026-11-02', '2026-11-08', 'sem-ativ-1', 'Sem Atividade', 172.86) $$,
  '%cópia exacta da semana anterior%',
  'a cópia exacta da semana anterior continua a ser recusada'
);

select * from finish();
rollback;
