-- ============================================================
-- Remover os movimentos Repsol duplicados e voltar a resolver o titular
-- ============================================================
-- Continua a migração anterior, que identificou 354 movimentos a dobrar e os
-- guardou em `repsol_duplicados_removidos_20260917` com a linha sobrevivente
-- em `mantido_id`. Nada se apaga aqui que não esteja já copiado para lá.
--
-- Depois de apagar, as linhas que ficaram levam um UPDATE sem efeito para o
-- trigger `resolver_motorista` voltar a decidir o titular pela DATA do
-- movimento, como manda o modelo de 2026-08-25. Sem o flag
-- `wegest.recalculo_forcado` o trigger só sobrepõe quando encontra titular, e
-- aqui quer-se o resultado limpo mesmo quando não encontra.
--
-- Por fim marcam-se para refecho as semanas já fechadas que continham
-- movimentos a dobrar: o líquido gravado nelas contou combustível a mais. O
-- extrato do motorista é derivado (motorista_extrato_periodo), esse corrige-se
-- sozinho; o líquido semanal está gravado e não.
--
-- Semanas com duplicados: 30/03, 06/04, 13/04, 20/04, 27/04, 03/08, 10/08,
-- 17/08, 24/08 e 31/08 de 2026.
-- ============================================================

DELETE FROM public.repsol_transacoes t
USING public.repsol_duplicados_removidos_20260917 b
WHERE t.id = b.id;

SELECT set_config('wegest.recalculo_forcado', '1', true);

UPDATE public.repsol_transacoes t
SET updated_at = t.updated_at
WHERE EXISTS (
  SELECT 1 FROM public.repsol_duplicados_removidos_20260917 b
  WHERE b.mantido_id = t.id
);

SELECT set_config('wegest.recalculo_forcado', '0', true);

INSERT INTO public.refecho_pendente (org_id, semana_inicio, semana_fim, motivo, detalhe)
SELECT DISTINCT
  b.org_id,
  (date_trunc('week', b.transaction_date))::date,
  (date_trunc('week', b.transaction_date) + interval '6 days')::date,
  'movimentos_duplicados_removidos',
  jsonb_build_object('plataforma', 'repsol', 'origem', 'repsol_duplicados_removidos_20260917')
FROM public.repsol_duplicados_removidos_20260917 b
WHERE b.org_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.motorista_liquido_semanal l
    WHERE l.org_id = b.org_id
      AND l.semana_inicio = (date_trunc('week', b.transaction_date))::date
  )
  -- `refecho_pendente` não tem chave única sobre (org, semana, motivo), por
  -- isso um segundo passar desta migração acrescentaria as mesmas semanas
  -- outra vez. Guarda explícita em vez de ON CONFLICT.
  AND NOT EXISTS (
    SELECT 1 FROM public.refecho_pendente r
    WHERE r.org_id = b.org_id
      AND r.semana_inicio = (date_trunc('week', b.transaction_date))::date
      AND r.motivo = 'movimentos_duplicados_removidos'
  );
