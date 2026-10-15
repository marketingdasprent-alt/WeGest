-- Viatura em manutenção não se entrega: contrato novo, troca de viatura ou reabertura com uma
-- viatura em 'manutencao' é recusado na base de dados.
--
-- A 12/10/2026 o BI-93-LC saiu para um motorista com um ticket "voltou com avaria" aberto há 4
-- dias: a viatura constava como disponível (ver 20261014100000) e nada travava o contrato.
-- Renovar o mesmo carro ao mesmo motorista continua a passar: não é uma entrega nova, e um
-- ticket menor com o carro na rua não pode parar a faturação. Fechar ou cancelar também passa.

CREATE OR REPLACE FUNCTION public.fn_contrato_recusa_viatura_em_manutencao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_matricula text;
  v_viatura_anterior uuid;
  v_entrega_nova boolean;
BEGIN
  IF NEW.viatura_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.estado_operacional NOT IN ('agendado', 'em_curso') THEN
    RETURN NEW;
  END IF;

  -- Só uma entrega nova conta: contrato novo, versão com outra viatura, troca, ou reabertura.
  IF TG_OP = 'INSERT' THEN
    IF NEW.contrato_anterior_id IS NULL THEN
      v_entrega_nova := true;
    ELSE
      SELECT viatura_id INTO v_viatura_anterior
        FROM public.contratos_renting WHERE id = NEW.contrato_anterior_id;
      v_entrega_nova := v_viatura_anterior IS DISTINCT FROM NEW.viatura_id;
    END IF;
  ELSE
    v_entrega_nova := OLD.viatura_id IS DISTINCT FROM NEW.viatura_id
                   OR OLD.estado_operacional NOT IN ('agendado', 'em_curso');
  END IF;
  IF NOT v_entrega_nova THEN
    RETURN NEW;
  END IF;

  SELECT v.status, v.matricula INTO v_status, v_matricula
    FROM public.viaturas v WHERE v.id = NEW.viatura_id;

  IF v_status = 'manutencao' THEN
    RAISE EXCEPTION 'A viatura % está em manutenção. Fecha o ticket de assistência, ou muda o estado da viatura, antes de a entregar.',
      coalesce(v_matricula, NEW.viatura_id::text)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_contrato_recusa_viatura_em_manutencao() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_contrato_recusa_viatura_em_manutencao ON public.contratos_renting;
CREATE TRIGGER trg_contrato_recusa_viatura_em_manutencao
  BEFORE INSERT OR UPDATE OF viatura_id, estado_operacional ON public.contratos_renting
  FOR EACH ROW EXECUTE FUNCTION public.fn_contrato_recusa_viatura_em_manutencao();

NOTIFY pgrst, 'reload schema';
