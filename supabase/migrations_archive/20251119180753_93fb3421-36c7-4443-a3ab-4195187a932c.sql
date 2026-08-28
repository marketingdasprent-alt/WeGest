-- Criar função que gerencia contratos de forma atômica
CREATE OR REPLACE FUNCTION public.gerar_contrato_atomico(
  p_motorista_id UUID,
  p_empresa_id TEXT,
  p_motorista_nome TEXT,
  p_motorista_nif TEXT,
  p_motorista_email TEXT,
  p_motorista_telefone TEXT,
  p_motorista_morada TEXT,
  p_motorista_documento_tipo TEXT,
  p_motorista_documento_numero TEXT,
  p_cidade_assinatura TEXT,
  p_data_assinatura DATE,
  p_data_inicio DATE,
  p_duracao_meses INTEGER,
  p_criado_por UUID
)
RETURNS TABLE (
  id UUID,
  motorista_id UUID,
  empresa_id TEXT,
  motorista_nome TEXT,
  status TEXT,
  data_assinatura DATE,
  data_inicio DATE,
  created_at TIMESTAMPTZ,
  havia_contrato_anterior BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contrato_anterior_id UUID;
  v_novo_contrato_id UUID;
  v_havia_contrato BOOLEAN := FALSE;
BEGIN
  -- Buscar contrato ativo anterior
  SELECT c.id INTO v_contrato_anterior_id
  FROM public.contratos c
  WHERE c.motorista_id = p_motorista_id
    AND c.empresa_id = p_empresa_id
    AND c.status = 'ativo'
  LIMIT 1;

  -- Se encontrou contrato anterior, marcar flag
  IF v_contrato_anterior_id IS NOT NULL THEN
    v_havia_contrato := TRUE;
    
    -- Atualizar status para 'substituido'
    UPDATE public.contratos
    SET status = 'substituido',
        atualizado_em = NOW()
    WHERE id = v_contrato_anterior_id;
  END IF;

  -- Inserir novo contrato (sempre)
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
    status,
    criado_por
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
    'ativo',
    p_criado_por
  )
  RETURNING 
    contratos.id,
    contratos.motorista_id,
    contratos.empresa_id,
    contratos.motorista_nome,
    contratos.status,
    contratos.data_assinatura,
    contratos.data_inicio,
    contratos.criado_em
  INTO 
    v_novo_contrato_id,
    id,
    motorista_id,
    empresa_id,
    motorista_nome,
    status,
    data_assinatura,
    data_inicio,
    created_at;

  -- Retornar dados do novo contrato + flag se havia contrato anterior
  havia_contrato_anterior := v_havia_contrato;
  
  RETURN NEXT;
END;
$$;