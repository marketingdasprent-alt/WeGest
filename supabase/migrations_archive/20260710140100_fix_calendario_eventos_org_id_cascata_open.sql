-- contrato_renting_cascata_open() gerava os eventos de calendário
-- (entrega/recolha) sem definir org_id explicitamente, confiando no
-- DEFAULT get_current_org_id() da coluna — que só resolve bem com sessão
-- de app activa. Um import/seed em lote sem JWT deixava org_id NULL,
-- tornando o evento invisível via RLS (ver migration anterior, backfill
-- de 147 linhas). Passa a gravar NEW.org_id (a org do próprio contrato)
-- explicitamente, robusto independentemente de quem/o que dispara o INSERT.
CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_matricula      text;
  v_cliente_nome   text;
  v_descricao      text;
  v_cidade_entrega text;
  v_cidade_recolha text;
BEGIN
  IF NEW.viatura_id IS NOT NULL THEN
    SELECT matricula INTO v_matricula FROM public.viaturas WHERE id = NEW.viatura_id;
    v_matricula := UPPER(REGEXP_REPLACE(v_matricula, '[\s-]', '', 'g'));
  END IF;
  IF NEW.cliente_id IS NOT NULL THEN
    SELECT nome INTO v_cliente_nome FROM public.clientes WHERE id = NEW.cliente_id;
  END IF;
  IF NEW.estacao_entrega_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(cidade), ''), nome) INTO v_cidade_entrega
      FROM public.estacoes WHERE id = NEW.estacao_entrega_id;
  END IF;
  IF NEW.estacao_recolha_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(TRIM(cidade), ''), nome) INTO v_cidade_recolha
      FROM public.estacoes WHERE id = NEW.estacao_recolha_id;
  END IF;

  v_descricao := COALESCE(
    NULLIF(TRIM(NEW.observacoes_internas), ''),
    'Gerado automaticamente pelo contrato #' || NEW.codigo
  );

  IF NEW.reserva_id IS NOT NULL THEN
    UPDATE public.reservas
       SET estado = 'em_curso'
     WHERE id = NEW.reserva_id
       AND estado IN ('confirmada', 'pendente');
  END IF;

  INSERT INTO public.calendario_eventos (
    org_id, tipo, titulo, descricao, cidade,
    data_inicio, data_fim, dia_todo,
    matricula_devolver, criado_por,
    origem_tipo, origem_id
  )
  VALUES (
    NEW.org_id, 'entrega',
    COALESCE(v_matricula, '?'),
    v_descricao, v_cidade_entrega,
    NEW.data_inicio, NEW.data_inicio, false,
    v_matricula, COALESCE(NEW.created_by, auth.uid()),
    'contrato_renting', NEW.id
  );

  IF NEW.data_fim IS NOT NULL AND NEW.regime <> 'tvde' THEN
    INSERT INTO public.calendario_eventos (
      org_id, tipo, titulo, descricao, cidade,
      data_inicio, data_fim, dia_todo,
      matricula_devolver, criado_por,
      origem_tipo, origem_id
    )
    VALUES (
      NEW.org_id, 'recolha',
      COALESCE(v_matricula, '?'),
      v_descricao, v_cidade_recolha,
      NEW.data_fim, NEW.data_fim, false,
      v_matricula, COALESCE(NEW.created_by, auth.uid()),
      'contrato_renting', NEW.id
    );
  END IF;

  RETURN NEW;
END;
$function$;
