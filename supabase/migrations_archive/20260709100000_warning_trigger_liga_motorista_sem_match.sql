-- ============================================================
-- RAISE WARNING quando contrato_renting_liga_motorista_open/close
-- não conseguem resolver motorista por nenhum dos 2 caminhos
-- (motoristas_ativos.cliente_id OU contrato_condutores.motorista_id).
-- Sai silencioso hoje: contrato muda viatura mas motorista_viaturas
-- não é actualizado, sem qualquer sinal em logs. Adiciona apenas
-- observabilidade — sem mudança de comportamento.
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_renting_liga_motorista_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motorista_id uuid;
BEGIN
  IF NEW.viatura_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.cliente_id IS NOT NULL THEN
    SELECT id INTO v_motorista_id
    FROM public.motoristas_ativos
    WHERE cliente_id = NEW.cliente_id
    LIMIT 1;
  END IF;

  IF v_motorista_id IS NULL THEN
    SELECT motorista_id INTO v_motorista_id
    FROM public.contrato_condutores
    WHERE contrato_id = NEW.id AND motorista_id IS NOT NULL
    LIMIT 1;
  END IF;

  IF v_motorista_id IS NULL THEN
    RAISE WARNING 'contrato_renting_liga_motorista_open: motorista não resolvido para contrato % (codigo %, cliente_id %, viatura_id %) — motorista_viaturas não sincronizado',
      NEW.id, NEW.codigo, NEW.cliente_id, NEW.viatura_id;
    RETURN NEW;
  END IF;

  -- Encerra associação activa anterior a outra viatura (troca/upgrade)
  UPDATE public.motorista_viaturas
     SET status = 'encerrado', data_fim = COALESCE(data_fim, NEW.data_inicio::date)
   WHERE motorista_id = v_motorista_id
     AND status = 'ativo'
     AND viatura_id IS DISTINCT FROM NEW.viatura_id;

  -- Cria associação se ainda não existir activa para esta viatura
  IF NOT EXISTS (
    SELECT 1 FROM public.motorista_viaturas
     WHERE motorista_id = v_motorista_id
       AND viatura_id = NEW.viatura_id
       AND status = 'ativo'
  ) THEN
    INSERT INTO public.motorista_viaturas (
      motorista_id, viatura_id, data_inicio, status, org_id, observacoes
    )
    VALUES (
      v_motorista_id, NEW.viatura_id, NEW.data_inicio::date, 'ativo', NEW.org_id,
      'Gerado automaticamente pelo contrato de aluguer #' || NEW.codigo
    );
  END IF;

  -- Garante motorista activo enquanto tiver contrato em curso
  UPDATE public.motoristas_ativos
     SET status_ativo = true
   WHERE id = v_motorista_id
     AND status_ativo = false;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.contrato_renting_liga_motorista_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motorista_id uuid;
  v_tem_outro_contrato boolean;
BEGIN
  IF NEW.viatura_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.cliente_id IS NOT NULL THEN
    SELECT id INTO v_motorista_id
    FROM public.motoristas_ativos
    WHERE cliente_id = NEW.cliente_id
    LIMIT 1;
  END IF;

  IF v_motorista_id IS NULL THEN
    SELECT motorista_id INTO v_motorista_id
    FROM public.contrato_condutores
    WHERE contrato_id = NEW.id AND motorista_id IS NOT NULL
    LIMIT 1;
  END IF;

  IF v_motorista_id IS NULL THEN
    RAISE WARNING 'contrato_renting_liga_motorista_close: motorista não resolvido para contrato % (codigo %, cliente_id %, viatura_id %) — motorista_viaturas não sincronizado',
      NEW.id, NEW.codigo, NEW.cliente_id, NEW.viatura_id;
    RETURN NEW;
  END IF;

  UPDATE public.motorista_viaturas
     SET status = 'encerrado', data_fim = COALESCE(data_fim, CURRENT_DATE)
   WHERE motorista_id = v_motorista_id
     AND viatura_id = NEW.viatura_id
     AND status = 'ativo';

  -- Só inactiva se não houver outro contrato_renting activo (e não substituído)
  -- para este motorista, considerando os dois caminhos (cliente_id directo OU
  -- contrato_condutores.motorista_id).
  SELECT EXISTS (
    SELECT 1
    FROM public.contratos_renting cr
    WHERE cr.id <> NEW.id
      AND cr.deleted_at IS NULL
      AND cr.substituido_em IS NULL
      AND cr.estado_operacional IN ('agendado', 'em_curso')
      AND (
        EXISTS (
          SELECT 1 FROM public.motoristas_ativos ma
          WHERE ma.id = v_motorista_id AND ma.cliente_id = cr.cliente_id
        )
        OR EXISTS (
          SELECT 1 FROM public.contrato_condutores cc
          WHERE cc.contrato_id = cr.id AND cc.motorista_id = v_motorista_id
        )
      )
  ) INTO v_tem_outro_contrato;

  IF NOT v_tem_outro_contrato THEN
    UPDATE public.motoristas_ativos
       SET status_ativo = false
     WHERE id = v_motorista_id;
  END IF;

  RETURN NEW;
END;
$$;
