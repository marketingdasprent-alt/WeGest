-- 1. Índice parcial UNIQUE para impedir contratos ativos duplicados por motorista+empresa
CREATE UNIQUE INDEX IF NOT EXISTS idx_contratos_unique_active
  ON public.contratos (motorista_id, empresa_id)
  WHERE status = 'ativo';

-- 2. Atualizar gerar_contrato_atomico com parâmetros opcionais para calendário/viatura
CREATE OR REPLACE FUNCTION public.gerar_contrato_atomico(
  p_motorista_id uuid,
  p_empresa_id text,
  p_motorista_nome text,
  p_motorista_nif text,
  p_motorista_email text,
  p_motorista_telefone text,
  p_motorista_morada text,
  p_motorista_documento_tipo text,
  p_motorista_documento_numero text,
  p_cidade_assinatura text,
  p_data_assinatura date,
  p_data_inicio date,
  p_duracao_meses integer,
  p_criado_por uuid,
  p_force_new_version boolean DEFAULT true,
  p_viatura_id uuid DEFAULT NULL,
  p_calendario_evento_id uuid DEFAULT NULL,
  p_checkout_pendente boolean DEFAULT false,
  p_template_id uuid DEFAULT NULL
)
RETURNS TABLE(id uuid, motorista_id uuid, empresa_id text, motorista_nome text, status text, data_assinatura date, data_inicio date, created_at timestamp with time zone, is_existing boolean, numero_contrato integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_versao_atual INTEGER;
  v_existing_contract RECORD;
BEGIN
  -- Se não forçar nova versão, verificar se já existe contrato ativo
  IF NOT p_force_new_version THEN
    SELECT * INTO v_existing_contract
    FROM public.contratos c
    WHERE c.motorista_id = p_motorista_id
      AND c.empresa_id = p_empresa_id
      AND c.status = 'ativo'
    LIMIT 1;

    -- Se existe, retornar o existente com flag is_existing = true
    IF FOUND THEN
      RETURN QUERY SELECT
        v_existing_contract.id,
        v_existing_contract.motorista_id,
        v_existing_contract.empresa_id,
        v_existing_contract.motorista_nome,
        v_existing_contract.status,
        v_existing_contract.data_assinatura,
        v_existing_contract.data_inicio,
        v_existing_contract.criado_em,
        true::boolean as is_existing,
        v_existing_contract.numero_contrato;
      RETURN;
    END IF;
  END IF;

  -- Buscar versão máxima existente para este motorista+empresa
  SELECT COALESCE(MAX(versao), 0) INTO v_versao_atual
  FROM public.contratos
  WHERE contratos.motorista_id = p_motorista_id
    AND contratos.empresa_id = p_empresa_id;

  -- Marcar contratos ativos anteriores como substituídos
  UPDATE public.contratos
  SET status = 'substituido',
      atualizado_em = now()
  WHERE contratos.motorista_id = p_motorista_id
    AND contratos.empresa_id = p_empresa_id
    AND contratos.status = 'ativo';

  -- Inserir novo contrato com versão incrementada
  RETURN QUERY
  INSERT INTO public.contratos (
    motorista_id,
    empresa_id,
    motorista_nome,
    motorista_nif,
    motorista_email,
    motorista_telefone,
    motorista_morada,
    motorista_documento_tipo,
    motorista_documento_numero,
    cidade_assinatura,
    data_assinatura,
    data_inicio,
    duracao_meses,
    versao,
    status,
    criado_por,
    viatura_id,
    calendario_evento_id,
    checkout_pendente,
    template_id
  ) VALUES (
    p_motorista_id,
    p_empresa_id,
    p_motorista_nome,
    p_motorista_nif,
    p_motorista_email,
    p_motorista_telefone,
    p_motorista_morada,
    p_motorista_documento_tipo,
    p_motorista_documento_numero,
    p_cidade_assinatura,
    p_data_assinatura,
    p_data_inicio,
    p_duracao_meses,
    v_versao_atual + 1,
    'ativo',
    p_criado_por,
    p_viatura_id,
    p_calendario_evento_id,
    COALESCE(p_checkout_pendente, false),
    p_template_id
  )
  RETURNING
    contratos.id,
    contratos.motorista_id,
    contratos.empresa_id,
    contratos.motorista_nome,
    contratos.status,
    contratos.data_assinatura,
    contratos.data_inicio,
    contratos.criado_em,
    false::boolean as is_existing,
    contratos.numero_contrato;
END;
$function$;
