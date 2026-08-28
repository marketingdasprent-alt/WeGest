-- ============================================================
-- Fase 3 — Activar agendamento semanal de cobranças TVDE
-- ============================================================
-- A função public.gerar_cobrancas_tvde_semanais já existe (criada
-- em 20260520000005_gerar_cobrancas_tvde.sql) mas o cron estava
-- comentado à espera de validação do pg_cron no projecto.
--
-- pg_cron está activo (extensão já criada em migrations anteriores).
-- Corre todas as 2ª-feiras às 06:00 UTC (≈07:00 Lisboa no inverno,
-- ≈08:00 no verão) — antes dos colaboradores chegarem.
--
-- p_semanas_a_frente=1 → gera a semana actual + 1 à frente.
-- Função é idempotente (ON CONFLICT DO NOTHING) — correr 2x não duplica.
--
-- Idempotência da própria migration: faz unschedule do nome antes
-- de re-schedule (caso a migration corra 2x).
-- ============================================================

DO $$
BEGIN
  PERFORM cron.unschedule('gerar-cobrancas-tvde-semanais');
EXCEPTION
  WHEN OTHERS THEN
    -- Job não existia ainda — ok.
    NULL;
END $$;

SELECT cron.schedule(
  'gerar-cobrancas-tvde-semanais',
  '0 6 * * 1',
  $$ SELECT public.gerar_cobrancas_tvde_semanais(1); $$
);
