-- ============================================================
-- A atribuição motorista↔viatura passa a acabar quando o contrato acaba
-- ============================================================
-- O QUE ESTAVA MAL
-- fn_contrato_condutor_liga_motorista copiava a data de INÍCIO do contrato
-- para motorista_viaturas e nunca a de FIM. A atribuição nascia em aberto
-- (data_fim NULL) e ficava assim para sempre.
--
-- Quem paga a factura é o resumo semanal: buildSlotPeriodos (slotPeriodos.ts)
-- lê motorista_viaturas, não o contrato. Sem data_fim, usa o fim da SEMANA e
-- cobra os 7 dias — todas as semanas, indefinidamente, mesmo muito depois de
-- o contrato ter acabado.
--
-- CASO REAL (Carla Marlene Domingos Cabreiras, semana 03-09/08/2026)
--   contrato #776, BV-24-OQ, acaba 07/08 -> 5 dias de contrato na semana
--   recibo dela:  5 x 39,29 = 196,43 EUR   (certo)
--   WeGest:       7 x 39,29 = 275,00 EUR   (78,57 EUR a mais)
--
-- O QUE MUDA
--   1. O INSERT passa a copiar a data de fim do contrato.
--   2. Prolongar ou encurtar o contrato arrasta a atribuição (trigger novo).
--      Sem isto, estender um contrato deixava a atribuição fechada cedo de
--      mais -- o erro simétrico, a cobrar de MENOS.
--   3. Fecham-se as atribuições que já ficaram em aberto.
--
-- CUIDADO NO BACKFILL
-- Só se fecha uma atribuição quando o contrato que a gerou já acabou E não
-- existe outro contrato activo para a mesma viatura e o mesmo motorista. Sem
-- essa segunda condição fechavam-se renovações: há atribuições geradas por um
-- contrato de 2023 cujo motorista continua ao volante com contrato novo (a
-- Maria Luisa Aço aparece com 1.070 dias, e é renovação, não cobrança
-- indevida).
--
-- A data converte-se em hora de Lisboa, não em UTC: o contrato da Carla acaba
-- às 21:00 UTC de 07/08, que é 22:00 do dia 07 em Lisboa. Em UTC dava o mesmo
-- dia por sorte; num contrato que acabe às 23:30 UTC daria o dia seguinte e
-- cobrava-se um dia a mais.
-- ============================================================

-- 1) A origem: copiar também a data de fim.
CREATE OR REPLACE FUNCTION public.fn_contrato_condutor_liga_motorista()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_c public.contratos_renting%ROWTYPE;
BEGIN
  IF NEW.motorista_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_c FROM public.contratos_renting WHERE id = NEW.contrato_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF v_c.deleted_at IS NOT NULL OR v_c.substituido_em IS NOT NULL THEN RETURN NEW; END IF;
  IF v_c.estado_operacional NOT IN ('agendado', 'em_curso') THEN RETURN NEW; END IF;
  IF v_c.viatura_id IS NULL OR v_c.regime = 'slot' THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.motorista_viaturas
    WHERE motorista_id = NEW.motorista_id AND viatura_id = v_c.viatura_id
      AND status = 'ativo' AND data_fim IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.motorista_viaturas
    WHERE viatura_id = v_c.viatura_id AND status = 'ativo' AND data_fim IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.motorista_viaturas
    WHERE motorista_id = NEW.motorista_id AND status = 'ativo' AND data_fim IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.motorista_viaturas
    (motorista_id, viatura_id, data_inicio, data_fim, status, org_id, observacoes)
  VALUES (
    NEW.motorista_id,
    v_c.viatura_id,
    COALESCE((v_c.data_inicio AT TIME ZONE 'Europe/Lisbon')::date, CURRENT_DATE),
    -- A NOVIDADE. Contrato sem fim (aluguer de longa duração em aberto)
    -- continua a gerar atribuição em aberto, que é o correcto.
    (v_c.data_fim AT TIME ZONE 'Europe/Lisbon')::date,
    'ativo', v_c.org_id, 'Gerado ao associar condutor ao contrato #' || v_c.codigo
  );

  UPDATE public.motoristas_ativos SET status_ativo = true
   WHERE id = NEW.motorista_id AND status_ativo = false;

  RETURN NEW;
END;
$function$;

-- 2) Mexer no contrato arrasta a atribuição que ele gerou.
CREATE OR REPLACE FUNCTION public.fn_contrato_sincroniza_atribuicao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.data_fim IS NOT DISTINCT FROM OLD.data_fim THEN RETURN NEW; END IF;
  IF NEW.viatura_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.motorista_viaturas mv
     SET data_fim = (NEW.data_fim AT TIME ZONE 'Europe/Lisbon')::date
   WHERE mv.viatura_id = NEW.viatura_id
     AND mv.org_id = NEW.org_id
     AND mv.observacoes = 'Gerado ao associar condutor ao contrato #' || NEW.codigo
     AND mv.data_fim IS DISTINCT FROM (NEW.data_fim AT TIME ZONE 'Europe/Lisbon')::date;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_contrato_sincroniza_atribuicao ON public.contratos_renting;
CREATE TRIGGER trg_contrato_sincroniza_atribuicao
  AFTER UPDATE OF data_fim ON public.contratos_renting
  FOR EACH ROW EXECUTE FUNCTION public.fn_contrato_sincroniza_atribuicao();

-- 3) O QUE ESTA MIGRAÇÃO NÃO FAZ, DE PROPÓSITO: fechar as atribuições antigas.
--
-- Há 8 atribuições em aberto cujo contrato já acabou. A tentação é fechá-las
-- todas de uma vez. Não se faz, e a razão está nos dados: os 7 motoristas
-- afectados ESTÃO TODOS A CONDUZIR — todos com ganhos Bolt nos últimos 30
-- dias, 6 deles na própria semana de 03-09/08.
--
--   Maria Luisa Aço          contrato #654 acabou 2023-09-09   31,16 EUR/30d
--   Fábio Monteiro Santos    contrato #732 acabou 2026-03-08  318,35 EUR/30d
--   Andressa Pierri Machado  contrato #733 acabou 2026-05-07  893,80 EUR/30d
--   José Ramalhão Carvalho   contrato #783 acabou 2026-05-17   92,45 EUR/30d
--   Joaquim Silva Rosa       contrato #649 acabou 2026-06-02  935,55 EUR/30d
--   Carla Cabreiras          contrato #776 acabou 2026-08-07  591,50 EUR/30d
--   Pedro Rego               contrato #655 acabou 2026-08-09  464,47 EUR/30d
--   (Rui Teixeira fica de fora: tem contrato vivo para a mesma viatura.)
--
-- Fechá-las fazia o resumo semanal DEIXAR de cobrar aluguer a quem anda com o
-- carro — trocava cobrar a mais por cobrar a menos, que é pior. Os dados não
-- dizem qual das duas versões é a verdadeira: ou o contrato foi renovado fora
-- do sistema (e a atribuição é que está certa), ou a pessoa deixou de alugar
-- (e a cobrança é indevida). Isso decide-se contrato a contrato, com quem sabe.
--
-- Para as encontrar a qualquer momento:
--   SELECT m.nome, v.matricula, c.codigo, c.data_fim
--     FROM motorista_viaturas mv
--     JOIN contratos_renting c
--       ON c.codigo = (regexp_match(mv.observacoes, '#(\d+)'))[1]::int
--     JOIN motoristas_ativos m ON m.id = mv.motorista_id
--     LEFT JOIN viaturas v ON v.id = mv.viatura_id
--    WHERE mv.data_fim IS NULL AND mv.status = 'ativo' AND c.data_fim < now();

COMMENT ON FUNCTION public.fn_contrato_condutor_liga_motorista() IS
  'Cria a ligação motorista↔viatura ao associar um condutor ao contrato, com o '
  'início E o FIM do contrato. Sem a data de fim o resumo semanal cobrava os 7 '
  'dias para sempre. Ver migração 20260814140000.';

COMMENT ON FUNCTION public.fn_contrato_sincroniza_atribuicao() IS
  'Prolongar ou encurtar o contrato arrasta a data de fim da atribuição que ele '
  'gerou. Ver migração 20260814140000.';
