-- ============================================================
-- CHECK constraint de calendario_eventos.tipo — lista completa
-- ============================================================
-- Bug: a CHECK actual aceita apenas
--   ('entrega', 'recolha', 'devolucao', 'troca', 'upgrade', 'lista_espera')
-- mas os triggers em movimento_calendario_sync inserem tipos
--   ('transferencia', 'reparacao', 'manutencao', 'inspecao', 'impro')
-- que NÃO estão na constraint. Sintoma: criar movimento via UI
-- falha com violação de check_constraint quando o trigger dispara.
--
-- Esta migration alinha a constraint com os tipos efectivamente
-- usados pelos triggers + UI manual.
--
-- Lista completa identificada:
--   • De contratos (cascata_open, cascata_versao): entrega, recolha,
--     troca, upgrade
--   • De movimentos (movimento_calendario_sync): transferencia,
--     reparacao, manutencao, inspecao, impro
--   • Manuais (NovoEventoPage, RecolhaCheckinStep, etc.): devolucao,
--     lista_espera
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) Sanity check defensivo: listar tipos efectivamente presentes
-- ────────────────────────────────────────────────────────────
-- Se houver tipos fora da lista nova (resíduo legacy de
-- 'tarefa'/'reuniao'/'afazer'/'outro'), o ADD CONSTRAINT abaixo
-- vai falhar. Nesse caso, descomenta o UPDATE de cleanup ou
-- ajusta os tipos manualmente antes de re-executar.
--
-- DO $$
-- DECLARE v_tipos_invalidos text[];
-- BEGIN
--   SELECT array_agg(DISTINCT tipo) INTO v_tipos_invalidos
--     FROM public.calendario_eventos
--    WHERE tipo NOT IN (
--      'entrega', 'recolha', 'devolucao', 'troca', 'upgrade',
--      'lista_espera', 'transferencia', 'reparacao', 'manutencao',
--      'inspecao', 'impro'
--    );
--   IF v_tipos_invalidos IS NOT NULL THEN
--     RAISE NOTICE 'Tipos fora da lista nova: %', v_tipos_invalidos;
--   END IF;
-- END $$;

-- ────────────────────────────────────────────────────────────
-- 2) Cleanup opcional (descomenta só se o sanity check acima
--    devolver tipos legacy que queres normalizar para 'outro').
-- ────────────────────────────────────────────────────────────
-- UPDATE public.calendario_eventos
--    SET tipo = 'outro'
--  WHERE tipo IN ('tarefa', 'reuniao', 'afazer', 'outro');

-- ────────────────────────────────────────────────────────────
-- 3) Drop + recreate da CHECK constraint
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.calendario_eventos
  DROP CONSTRAINT IF EXISTS calendario_eventos_tipo_check;

ALTER TABLE public.calendario_eventos
  ADD CONSTRAINT calendario_eventos_tipo_check
  CHECK (tipo = ANY (ARRAY[
    -- Gerados pela cascata de contratos
    'entrega',
    'recolha',
    'troca',
    'upgrade',
    -- Gerados pela cascata de movimentos
    'transferencia',
    'reparacao',
    'manutencao',
    'inspecao',
    'impro',
    -- Manuais via UI
    'devolucao',
    'lista_espera'
  ]));

COMMENT ON CONSTRAINT calendario_eventos_tipo_check ON public.calendario_eventos IS
  'Lista canónica de tipos. Triggers em contratos_renting (entrega/recolha/troca/upgrade) '
  'e movimentos (transferencia/reparacao/manutencao/inspecao/impro) inserem aqui. '
  'A UI manual usa devolucao e lista_espera para fluxos sem origem automática.';
