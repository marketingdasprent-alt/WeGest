-- ============================================================
-- Reaplica "versões fecham como fechado" depois da PR #206
-- ============================================================
-- A 20260820150400 já tinha reescrito renovar_contrato_renting e
-- criar_versao_contrato_renting para fecharem o elo antigo como 'fechado', e
-- em produção é isso que está instalado.
--
-- Mas a PR #206 traz 20260820140000_tipo_fecho_contrato.sql, que faz
-- CREATE OR REPLACE de criar_versao_contrato_renting com 'cancelado' no corpo.
-- Essa migração ainda NÃO está aplicada em produção — vai correr no deploy, e
-- como o `supabase db push` aplica tudo o que ainda não está registado
-- independentemente da ordem relativa ao que já correu, ela entraria DEPOIS da
-- 150400 e desfazia-a em silêncio. As trocas voltariam a fechar o elo antigo
-- como 'cancelado', que é precisamente o estado que o fechar-semana-financeiro
-- exclui.
--
-- Num clone de raiz o problema não existe (140000 < 150400), mas a produção
-- não é um clone de raiz. Esta migração fecha as duas situações.
--
-- Ao contrário da 150400, NÃO explode quando não há nada a trocar: aqui o
-- normal é já estar tudo certo. Só reporta o que mexeu.
-- ============================================================

DO $migracao$
DECLARE
  v_oid     oid;
  v_def     text;
  v_conta   integer := 0;
  v_antigo  constant text := 'estado_operacional = ''cancelado''::contrato_estado_operacional_enum';
  v_novo    constant text := 'estado_operacional = ''fechado''::contrato_estado_operacional_enum';
BEGIN
  -- Por OID: criar_versao_contrato_renting tem duas sobrecargas e o cast
  -- ::regproc rebentaria com "more than one function named".
  FOR v_oid IN
    SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('renovar_contrato_renting', 'criar_versao_contrato_renting')
     ORDER BY p.oid
  LOOP
    v_def := pg_get_functiondef(v_oid);
    IF position(v_antigo IN v_def) = 0 THEN
      CONTINUE;
    END IF;

    EXECUTE replace(v_def, v_antigo, v_novo);
    v_conta := v_conta + 1;
    RAISE NOTICE 'Reposta: % volta a fechar versoes como fechado.', v_oid::regprocedure;
  END LOOP;

  IF v_conta = 0 THEN
    RAISE NOTICE 'Nada a repor — as versoes ja fecham como fechado.';
  END IF;
END
$migracao$;
