-- Via Verde: dia da semana + hora do sync automático configuráveis por
-- integração (antes fixo: sempre Segunda 04:00 Lisboa para todas as orgs).
--
-- sync_dia_semana: 0=Domingo .. 6=Sábado (convenção JS Date.getDay()).
-- sync_hora: 0-23, hora local de Lisboa.
-- Defaults preservam o comportamento atual (Segunda=1, 04h00) para
-- integrações já existentes.
ALTER TABLE public.plataformas_configuracao
  ADD COLUMN IF NOT EXISTS sync_dia_semana smallint NOT NULL DEFAULT 1
    CHECK (sync_dia_semana BETWEEN 0 AND 6),
  ADD COLUMN IF NOT EXISTS sync_hora smallint NOT NULL DEFAULT 4
    CHECK (sync_hora BETWEEN 0 AND 23);

-- O cron passa a correr todas as horas — a função via-verde-scheduled-sync
-- decide, a cada chamada, quais integrações têm sync_dia_semana/sync_hora a
-- corresponder à hora atual em Lisboa (calculado em JS com Intl, para lidar
-- corretamente com DST — mais simples/fiável do que tentar pré-calcular o
-- offset UTC aqui em SQL).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'via-verde-weekly-sync') THEN
    PERFORM cron.unschedule('via-verde-weekly-sync');
  END IF;
END $$;

SELECT cron.schedule(
  'via-verde-weekly-sync',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/via-verde-scheduled-sync',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
