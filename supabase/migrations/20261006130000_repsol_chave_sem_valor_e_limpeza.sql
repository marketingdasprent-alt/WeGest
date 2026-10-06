-- Repsol: a chave de uma abastecida deixa de levar o valor (ver _shared/repsol/chave.ts).
--
-- A Repsol revê o valor dias depois (40,00 passa a 39,65, 6,00 a 4,00). A chave levava-o,
-- a reimportação de 06/10/2026 criou uma linha nova ao lado de cada antiga e o resumo somou as
-- duas (caso Alysson, cartão 2459, 28/09). Esta migração:
--   1) guarda e apaga a linha ANTIGA de cada par, deixando a mais recente (valor final);
--   2) passa a chave das que ficam ao formato novo, para a próxima reimportação as atualizar
--      em vez de duplicar.
-- Semanas já liquidadas do motorista não se tocam: os dois lados ficam, para não mudar o que
-- já foi pago. Só o formato com valor na chave é afetado; os formatos antigos ficam como estão.

CREATE TABLE IF NOT EXISTS public.repsol_duplicados_removidos_20261006 (
  LIKE public.repsol_transacoes INCLUDING DEFAULTS,
  mantido_id uuid,
  removido_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.repsol_duplicados_removidos_20261006 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.repsol_duplicados_removidos_20261006 FROM anon, authenticated;

DROP POLICY IF EXISTS rls_deny_anon ON public.repsol_duplicados_removidos_20261006;
CREATE POLICY rls_deny_anon ON public.repsol_duplicados_removidos_20261006
  AS RESTRICTIVE FOR ALL TO anon USING (false);

DROP POLICY IF EXISTS rls_org_isolation ON public.repsol_duplicados_removidos_20261006;
CREATE POLICY rls_org_isolation ON public.repsol_duplicados_removidos_20261006
  AS RESTRICTIVE FOR ALL TO public
  USING (org_id = get_current_org_id())
  WITH CHECK (org_id = get_current_org_id());

-- repsol-<cartão>-<instante>-<valor>-<litros>  →  repsol-<cartão>-<instante>-<litros>[-dev]
CREATE OR REPLACE FUNCTION public.repsol_chave_sem_valor(p_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT CASE
    WHEN p_id ~ '^repsol-[0-9]+-[0-9]{14}-(-?[0-9]+\.[0-9]{2})-[0-9]+\.[0-9]{2}$'
    THEN regexp_replace(p_id, '^(repsol-[0-9]+-[0-9]{14})-(-?)[0-9]+\.[0-9]{2}-([0-9]+\.[0-9]{2})$',
                        '\1-\3') || CASE WHEN p_id ~ '^repsol-[0-9]+-[0-9]{14}--' THEN '-dev' ELSE '' END
    ELSE p_id
  END
$function$;

REVOKE EXECUTE ON FUNCTION public.repsol_chave_sem_valor(text) FROM PUBLIC, anon;

-- Devolve: linhas apagadas, chaves reescritas, linhas repetidas que ficaram por estarem em semana paga.
CREATE OR REPLACE FUNCTION public.repsol_limpar_valor_na_chave()
RETURNS TABLE (apagadas integer, reescritas integer, ficaram_semana_paga integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_apagadas integer;
  v_reescritas integer;
  v_pagas integer;
BEGIN
  DROP TABLE IF EXISTS _repsol_alvo;
  CREATE TEMP TABLE _repsol_alvo ON COMMIT DROP AS
  SELECT t.id,
         row_number() OVER w AS rn,
         first_value(t.id) OVER w AS mantido,
         public.repsol_chave_sem_valor(t.transaction_id) AS nova,
         (t.motorista_id IS NOT NULL AND public.semana_ja_liquidada(
            t.motorista_id,
            date_trunc('week', t.transaction_date AT TIME ZONE 'Europe/Lisbon')::date,
            date_trunc('week', t.transaction_date AT TIME ZONE 'Europe/Lisbon')::date + 6)) AS semana_paga
    FROM public.repsol_transacoes t
   WHERE public.repsol_chave_sem_valor(t.transaction_id) <> t.transaction_id
     -- Repetida que ficou por semana paga: a chave nova já é da mais recente, não se repete.
     AND NOT EXISTS (
       SELECT 1 FROM public.repsol_transacoes x
        WHERE x.integracao_id = t.integracao_id
          AND x.transaction_id = public.repsol_chave_sem_valor(t.transaction_id))
  WINDOW w AS (PARTITION BY t.integracao_id, public.repsol_chave_sem_valor(t.transaction_id)
               ORDER BY t.created_at DESC, t.id DESC);

  INSERT INTO public.repsol_duplicados_removidos_20261006
  SELECT t.*, a.mantido, now()
    FROM public.repsol_transacoes t JOIN _repsol_alvo a ON a.id = t.id
   WHERE a.rn > 1 AND NOT a.semana_paga;

  DELETE FROM public.repsol_transacoes t USING _repsol_alvo a
   WHERE a.id = t.id AND a.rn > 1 AND NOT a.semana_paga;
  GET DIAGNOSTICS v_apagadas = ROW_COUNT;

  SELECT count(*)::integer INTO v_pagas FROM _repsol_alvo WHERE rn > 1 AND semana_paga;

  -- Só o transaction_id muda: o gatilho que resolve o titular não pode reatribuir ninguém.
  ALTER TABLE public.repsol_transacoes DISABLE TRIGGER resolver_motorista;
  UPDATE public.repsol_transacoes t SET transaction_id = a.nova
    FROM _repsol_alvo a WHERE a.id = t.id AND a.rn = 1;
  GET DIAGNOSTICS v_reescritas = ROW_COUNT;
  ALTER TABLE public.repsol_transacoes ENABLE TRIGGER resolver_motorista;

  RETURN QUERY SELECT v_apagadas, v_reescritas, v_pagas;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.repsol_limpar_valor_na_chave() FROM PUBLIC, anon, authenticated;

SELECT * FROM public.repsol_limpar_valor_na_chave();

NOTIFY pgrst, 'reload schema';
