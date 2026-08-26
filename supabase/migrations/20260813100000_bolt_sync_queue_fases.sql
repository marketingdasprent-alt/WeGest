-- ============================================================
-- bolt_sync_queue: partir a semana em fases que cabem sempre
-- ============================================================
-- O PROBLEMA
-- Uma semana da maior frota (Distancia Lisboa, ~40 mil viagens) não cabe de
-- forma fiável nos 150 s da edge function. E não é questão de afinar: os
-- tempos medidos a 2026-08-12/13 para a MESMA semana foram 99 s, 104 s,
-- 129 s e 147 s, sem correlação com o número de viagens nem com haver outro
-- job a correr. A variação vem da latência da Bolt, que não controlamos.
--
-- Paralelizar as páginas ajudou (antes era falha garantida), mas trocou o
-- muro do tempo pelo da memória (WORKER_RESOURCE_LIMIT) e pelo limite de
-- débito da Bolt (1005 TOO_MANY_REQUESTS). Aumentar a concorrência agrava
-- os dois. Não há afinação que resolva: o trabalho tem de ser MENOR.
--
-- O DESENHO
-- Separa-se o que precisa da API do que não precisa:
--
--   fase='viagens'  → um job por DIA. Busca à API e grava em bolt_viagens.
--                     ~5 mil viagens, ~20 s. Cabe sempre.
--   fase='agregar'  → um job por SEMANA. Lê as viagens da BD (sem rede),
--                     agrega por motorista e grava bolt_resumos_semanais.
--   fase='completo' → o comportamento de sempre, numa só passagem. Continua
--                     a ser o que se usa nas frotas pequenas, onde a semana
--                     inteira demora 6 a 26 s.
--
-- Isto é possível porque bolt_viagens guarda TODOS os campos que o agregador
-- consome (as 9 parcelas de order_price, distância, estado, motorista), por
-- isso reconstruir a ordem a partir da BD é sem perdas — a fórmula continua
-- a ser a mesma, em TypeScript, num sítio só.
--
-- A fase 'agregar' de uma semana só corre depois de os dias dessa semana
-- estarem todos 'completed'; enquanto não estiverem, volta para a fila.
-- ============================================================

ALTER TABLE public.bolt_sync_queue
  ADD COLUMN IF NOT EXISTS fase text NOT NULL DEFAULT 'completo';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.bolt_sync_queue'::regclass
       AND conname = 'bolt_sync_queue_fase_check'
  ) THEN
    ALTER TABLE public.bolt_sync_queue
      ADD CONSTRAINT bolt_sync_queue_fase_check
      CHECK (fase IN ('completo', 'viagens', 'agregar'));
  END IF;
END $$;

COMMENT ON COLUMN public.bolt_sync_queue.fase IS
  'completo = busca e agrega numa passagem (frotas pequenas). '
  'viagens = só busca à API e grava bolt_viagens (um job por dia). '
  'agregar = só lê a BD e grava os resumos da semana. Ver migração 20260813100000.';

-- A semana à qual um job de fase='viagens' pertence. É o que permite ao
-- 'agregar' saber de que dias depende sem os adivinhar pelas datas.
ALTER TABLE public.bolt_sync_queue
  ADD COLUMN IF NOT EXISTS semana_inicio date;

UPDATE public.bolt_sync_queue
   SET semana_inicio = periodo_inicio
 WHERE semana_inicio IS NULL;

COMMENT ON COLUMN public.bolt_sync_queue.semana_inicio IS
  'Segunda-feira da semana a que este job pertence. Nos jobs diários difere '
  'de periodo_inicio; nos semanais é igual.';

CREATE INDEX IF NOT EXISTS idx_bolt_sync_queue_semana
  ON public.bolt_sync_queue (integracao_id, semana_inicio, fase, status);
