-- ============================================================
-- Renovação, troca e edição fecham a versão antiga como FECHADO
-- ============================================================
-- Sem isto, 20260820150200 degrada-se sozinha: corrige os 134 históricos,
-- mas a renovação/troca/edição seguinte volta a escrever 'cancelado' e o
-- passivo recomeça.
--
-- Fechar a versão de um mês para abrir a seguinte é um FECHO, nunca foi um
-- cancelamento — o aluguer aconteceu e é facturável. Só o novo botão
-- "Cancelar contrato" escreve 'cancelado'.
--
-- PORQUÊ REESCREVER POR pg_get_functiondef E NÃO COLAR O CORPO
-- renovar_contrato_renting tem 7,3 KB e criar_versao_contrato_renting 4,1 KB.
-- Colá-las aqui inteiras significava congelar uma cópia que fica em silêncio
-- desactualizada assim que alguém lhes tocar noutra migração — e o risco de
-- um erro de transcrição num corpo que ninguém vai reler. Em vez disso pega-se
-- no que está realmente instalado e troca-se só o literal.
--
-- Verificado antes de escrever esta migração: cada função tem EXACTAMENTE uma
-- ocorrência de `estado_operacional = 'cancelado'::contrato_estado_operacional_enum`,
-- e em ambas é a escrita que fecha a versão antiga. Nenhuma delas LÊ
-- 'cancelado' em guards, por isso não há nada que a troca possa partir.
-- O guard abaixo faz explodir a migração se essa premissa deixar de ser
-- verdade, em vez de a aplicar em silêncio e não fazer nada.
-- ============================================================

DO $migracao$
DECLARE
  v_oid     oid;
  v_def     text;
  v_novo    text;
  v_conta   integer := 0;
  v_antigo  constant text := 'estado_operacional = ''cancelado''::contrato_estado_operacional_enum';
  v_novo_lt constant text := 'estado_operacional = ''fechado''::contrato_estado_operacional_enum';
BEGIN
  -- Resolver por OID e nao por regproc: criar_versao_contrato_renting tem
  -- duas sobrecargas -- (uuid,text) e (uuid,text,timestamptz) -- e
  -- 'public.criar_versao_contrato_renting'::regproc rebenta com
  -- "more than one function named". Percorrem-se todas as sobrecargas e
  -- reescrevem-se so as que realmente escrevem 'cancelado'; a de 2 argumentos
  -- e um wrapper que delega e nao tem o literal.
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

    v_novo := replace(v_def, v_antigo, v_novo_lt);
    EXECUTE v_novo;
    v_conta := v_conta + 1;
    RAISE NOTICE 'Reescrita: % passa a fechar versoes como fechado.', v_oid::regprocedure;
  END LOOP;

  -- Guarda: se ninguem escreve 'cancelado', a premissa desta migracao caiu e
  -- e preciso verificar a mao em vez de aplicar em silencio e nao fazer nada.
  IF v_conta = 0 THEN
    RAISE EXCEPTION
      'Premissa quebrada: nenhuma versao de renovar_contrato_renting/'
      'criar_versao_contrato_renting escreve estado_operacional = ''cancelado''::enum.';
  END IF;
END
$migracao$;
