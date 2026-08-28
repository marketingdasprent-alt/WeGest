-- ============================================================
-- Seguro recorrente automático por motorista (semanal)
-- ============================================================
-- Cada motorista pode ter um valor de seguro semanal configurado. Um cron
-- semanal lança automaticamente esse valor como débito no financeiro do
-- motorista (categoria 'seguros'), uma vez por semana.
--
-- Modelo copiado do slot mensal / cobranças TVDE:
--   - valor por motorista em motoristas_ativos.seguro_valor_semanal
--   - referência única por (motorista, semana) → anti-duplicação idempotente
--   - função idempotente + cron semanal (2ª feira 06:00 UTC)
--
-- Idempotente e aditiva (segura para correr em produção).
-- ============================================================

-- 1. Valor de seguro semanal por motorista -----------------------------------
ALTER TABLE public.motoristas_ativos
  ADD COLUMN IF NOT EXISTS seguro_valor_semanal NUMERIC;

COMMENT ON COLUMN public.motoristas_ativos.seguro_valor_semanal IS
  'Valor de seguro semanal a debitar automaticamente ao motorista (NULL/0 = sem seguro recorrente).';

-- 2. Anti-duplicação: uma linha de seguro automático por motorista/semana -----
--    Índice parcial só sobre a referência do seguro automático — não mexe nos
--    lançamentos de seguro manuais (referencia NULL, ignorados pelo índice).
CREATE UNIQUE INDEX IF NOT EXISTS motorista_financeiro_seguro_ref_unico
  ON public.motorista_financeiro (referencia)
  WHERE categoria = 'seguros' AND referencia LIKE 'seguro-auto:%';

-- 3. Função idempotente: gera o seguro da semana em falta ---------------------
--    Semana = segunda a domingo (ISO). Por defeito gera a semana corrente;
--    p_semanas_a_frente permite pré-gerar semanas futuras.
CREATE OR REPLACE FUNCTION public.gerar_seguros_semanais(
  p_semanas_a_frente integer DEFAULT 0
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motorista  record;
  v_inicio     date;
  v_fim        date;
  v_ref        text;
  v_criadas    integer := 0;
  v_rowcount   integer;
BEGIN
  -- Segunda-feira da semana alvo (date_trunc('week') devolve a 2ª feira ISO).
  v_inicio := (date_trunc('week', current_date) + (GREATEST(p_semanas_a_frente, 0) || ' weeks')::interval)::date;
  v_fim := v_inicio + 6;

  FOR v_motorista IN
    SELECT m.id, m.org_id, m.seguro_valor_semanal
    FROM public.motoristas_ativos m
    WHERE m.status_ativo = true
      AND m.seguro_valor_semanal IS NOT NULL
      AND m.seguro_valor_semanal > 0
  LOOP
    v_ref := 'seguro-auto:' || v_motorista.id || ':' || to_char(v_inicio, 'YYYY-MM-DD');

    INSERT INTO public.motorista_financeiro (
      motorista_id, org_id, tipo, categoria, descricao, valor,
      data_movimento, status, referencia
    )
    VALUES (
      v_motorista.id,
      v_motorista.org_id,
      'debito',
      'seguros',
      'Seguro semanal (' || to_char(v_inicio, 'DD/MM') || ' a ' || to_char(v_fim, 'DD/MM/YYYY') || ')',
      v_motorista.seguro_valor_semanal,
      v_inicio,
      'pendente',
      v_ref
    )
    ON CONFLICT (referencia) WHERE categoria = 'seguros' AND referencia LIKE 'seguro-auto:%'
    DO NOTHING;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount > 0 THEN
      v_criadas := v_criadas + 1;
    END IF;
  END LOOP;

  RETURN v_criadas;
END;
$$;

COMMENT ON FUNCTION public.gerar_seguros_semanais(integer) IS
  'Lança o seguro semanal (débito, categoria seguros) de cada motorista ativo '
  'com seguro_valor_semanal definido. Idempotente por referência. Devolve o nº criado.';

GRANT EXECUTE ON FUNCTION public.gerar_seguros_semanais(integer) TO service_role;

-- 4. Cron semanal: 2ª feira às 06:00 UTC (idempotente) -----------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gerar-seguros-semanais') THEN
    PERFORM cron.unschedule('gerar-seguros-semanais');
  END IF;
  PERFORM cron.schedule(
    'gerar-seguros-semanais',
    '0 6 * * 1',
    $cron$ SELECT public.gerar_seguros_semanais(0); $cron$
  );
END $$;
