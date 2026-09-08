-- Numa troca de viatura, o contrato TVDE sucessor nasce ABERTO.
--
-- criar_versao_contrato_renting monta o sucessor com `data_fim` herdada do
-- antecessor, tal e qual. Num TVDE isso está errado por definição: o contrato
-- não tem fim (ver 20260908090000). O que herdava era a data da PRÓXIMA
-- RENOVAÇÃO do contrato antigo — quase sempre já passada, porque a renovação é
-- manual e ninguém a faz a tempo.
--
-- Caso real, contrato 446 (Adair Pinheiro): criado a 01/11/2025 para renovar a
-- 01/12/2025. Três trocas de viatura em Agosto de 2026 — 10/08, 17/08 e 20/08 —
-- e as três criaram um sucessor com fim a 01/12/2025, oito meses antes de
-- nascerem. O motorista continuou na rua; o aluguer dele deixou de ser
-- calculado e a viatura ficou falsamente livre para outro contrato.
--
-- Com `data_fim` a NULL o período fica aberto: o aluguer corre enquanto o
-- contrato existir e a trava `contratos_no_overbooking` protege a viatura.
--
-- Rent-a-car não muda: aí a data de fim é mesmo o fim do aluguer, e a regra de
-- 20260828230000 (recusar ou renovar quando o fim ficaria antes do início)
-- continua a aplicar-se — a linha nova entra ANTES dessa validação e só para
-- TVDE, por isso o caminho do rent-a-car fica intocado.
--
-- Alteração cirúrgica sobre o corpo em produção (md5 74ddd8c6…): insere-se o
-- ramo do TVDE logo a seguir a `v_data_fim := v_old.data_fim;`. Idempotente —
-- correr duas vezes não duplica nada — e falha alto se a âncora não existir,
-- em vez de gravar uma função meio aplicada.

DO $mig$
DECLARE
  v_def   text;
  v_novo  text;
  v_ancora constant text := '  v_data_fim := v_old.data_fim;';
  v_ramo  constant text := E'\n\n  -- Um TVDE não tem fim: o sucessor nasce ABERTO. Herdar a data_fim do\n  -- antecessor punha o contrato novo já expirado — ver 20260908091000.\n  -- A NULL, esta atribuição também desliga a validação seguinte, que só\n  -- faz sentido para períodos fechados (rent-a-car).\n  IF v_old.regime = ''tvde'' THEN\n    v_data_fim := NULL;\n  END IF;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'criar_versao_contrato_renting'
     AND pg_get_function_identity_arguments(p.oid) LIKE '%timestamp%';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'criar_versao_contrato_renting(uuid,text,timestamptz,uuid) não encontrada.';
  END IF;

  -- Já aplicada: sai sem tocar em nada.
  IF position('v_old.regime = ''tvde''' IN v_def) > 0 THEN
    RETURN;
  END IF;

  v_novo := replace(v_def, v_ancora, v_ancora || v_ramo);

  IF v_novo = v_def THEN
    RAISE EXCEPTION 'Âncora "%" não encontrada — a função mudou; rever a migração.', v_ancora;
  END IF;

  EXECUTE v_novo;
END
$mig$;
