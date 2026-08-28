-- ============================================================
-- A atribuição de viatura passa a usar a data do CONDUTOR
-- ============================================================
-- O gatilho fn_contrato_condutor_liga_motorista carimbava na
-- motorista_viaturas a data de início do CONTRATO, não a data em que a pessoa
-- passou a ser condutora dele.
--
-- O Adair Pinheiro tem todos os contratos a começar em 2025-11-01. Resultado:
-- BN-44-ST, BV-87-QO, BT-21-UN e BS-59-ZA ficaram todas registadas como tendo
-- começado nesse dia — quatro viaturas sobrepostas, do mesmo motorista, ao
-- mesmo tempo. O resumo faz `order by data_inicio desc limit 1`, e com quatro
-- empates o desempate é o que a base devolver primeiro: mostrou a BV-87-QO
-- numa semana em que ele andava na BT-21-UN e depois na BS-59-ZA.
--
-- Ao lado, no contrato_condutores, estavam as datas certas: 17/08 e 20/08.
--
-- O data_fim tinha o mesmo defeito, com efeito ainda mais absurdo: copiava o
-- fim do contrato mesmo quando esse fim é ANTERIOR ao início da atribuição
-- (contratos com data_fim em 2025-12-01 ainda `em_curso`). Daí as 24 linhas
-- com fim antes do início.
--
-- Passa a valer: as datas do condutor primeiro, as do contrato como recurso,
-- e um fim impossível vira período em aberto.
--
-- Não toca em dados — só no comportamento daqui para a frente. A reparação do
-- que já está gravado é separada.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_contrato_condutor_liga_motorista()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_c public.contratos_renting%ROWTYPE;
  v_inicio date;
  v_fim    date;
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

  -- A data do CONDUTOR é a que diz quando ele pegou nesta viatura. A do
  -- contrato só serve quando aquela não existe.
  v_inicio := COALESCE(
    (NEW.data_inicio AT TIME ZONE 'Europe/Lisbon')::date,
    (v_c.data_inicio AT TIME ZONE 'Europe/Lisbon')::date,
    CURRENT_DATE
  );

  v_fim := COALESCE(
    (NEW.data_fim AT TIME ZONE 'Europe/Lisbon')::date,
    (v_c.data_fim AT TIME ZONE 'Europe/Lisbon')::date
  );

  -- Um fim anterior ao início não é um período curto: é lixo. Vale mais uma
  -- atribuição em aberto, que alguém fecha, do que um intervalo impossível
  -- que nenhuma consulta por datas consegue interpretar.
  IF v_fim IS NOT NULL AND v_fim < v_inicio THEN
    v_fim := NULL;
  END IF;

  INSERT INTO public.motorista_viaturas
    (motorista_id, viatura_id, data_inicio, data_fim, status, org_id, observacoes)
  VALUES (
    NEW.motorista_id, v_c.viatura_id, v_inicio, v_fim,
    'ativo', v_c.org_id, 'Gerado ao associar condutor ao contrato #' || v_c.codigo
  );

  UPDATE public.motoristas_ativos SET status_ativo = true
   WHERE id = NEW.motorista_id AND status_ativo = false;

  RETURN NEW;
END;
$function$;
