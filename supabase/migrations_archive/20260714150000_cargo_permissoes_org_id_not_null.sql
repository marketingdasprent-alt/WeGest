-- ============================================================
-- cargo_permissoes.org_id NOT NULL
-- ============================================================
-- O backfill já foi feito em 20260713140000 (join por cargo_id, que é
-- NOT NULL e aponta para cargos.org_id, também NOT NULL desde
-- 20260513100004) — por isso não deve restar nenhuma linha NULL. Guarda
-- de contagem antes do ALTER para falhar alto e claro em vez de um erro
-- de constraint pouco legível, se algo escapou.
-- ============================================================

DO $$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM public.cargo_permissoes WHERE org_id IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION
      'cargo_permissoes ainda tem % linha(s) com org_id NULL — corrigir antes de aplicar NOT NULL',
      v_count;
  END IF;
END $$;

ALTER TABLE public.cargo_permissoes ALTER COLUMN org_id SET NOT NULL;
