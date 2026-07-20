-- ============================================================
-- Associação automática motorista↔viatura ao adicionar condutor
-- ============================================================
-- Um motorista deve ficar associado à viatura quando PARTILHA o contrato com
-- ela (regime não-slot). Isso já era criado pelo trigger
-- contrato_renting_liga_motorista_open — mas esse só dispara ao CRIAR o
-- contrato. No fluxo normal da app o condutor é inserido DEPOIS (insere-se o
-- contrato, depois os condutores), por isso a ligação nunca era criada e a
-- "Viatura Atual" do painel do motorista ficava vazia apesar do contrato.
--
-- Este trigger cobre esse buraco: ao inserir um condutor com motorista, cria a
-- ligação em motorista_viaturas. GUARDADO — só cria se a viatura E o motorista
-- estiverem livres (sem ligação ativa), para NÃO forçar a regra 1:1 nem gerar
-- conflitos novos (a regra 1:1 e a limpeza de casos antigos ficam para depois).
-- Slots continuam a ser associados à mão (comportamento existente).
-- ============================================================

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

  -- Já ligados um ao outro → nada a fazer (idempotente).
  IF EXISTS (
    SELECT 1 FROM public.motorista_viaturas
    WHERE motorista_id = NEW.motorista_id AND viatura_id = v_c.viatura_id
      AND status = 'ativo' AND data_fim IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- Guarda anti-conflito: não cria se a viatura já tem motorista ativo…
  IF EXISTS (
    SELECT 1 FROM public.motorista_viaturas
    WHERE viatura_id = v_c.viatura_id AND status = 'ativo' AND data_fim IS NULL
  ) THEN
    RETURN NEW;
  END IF;
  -- …ou se o motorista já tem viatura ativa (não forçamos 1:1 aqui).
  IF EXISTS (
    SELECT 1 FROM public.motorista_viaturas
    WHERE motorista_id = NEW.motorista_id AND status = 'ativo' AND data_fim IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.motorista_viaturas (motorista_id, viatura_id, data_inicio, status, org_id, observacoes)
  VALUES (NEW.motorista_id, v_c.viatura_id, COALESCE(v_c.data_inicio::date, CURRENT_DATE),
          'ativo', v_c.org_id, 'Gerado ao associar condutor ao contrato #' || v_c.codigo);

  UPDATE public.motoristas_ativos SET status_ativo = true
   WHERE id = NEW.motorista_id AND status_ativo = false;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_contrato_condutor_liga_motorista ON public.contrato_condutores;
CREATE TRIGGER trg_contrato_condutor_liga_motorista
  AFTER INSERT ON public.contrato_condutores
  FOR EACH ROW EXECUTE FUNCTION public.fn_contrato_condutor_liga_motorista();
