-- Remover constraint que impede contratos duplicados
DROP INDEX IF EXISTS idx_contratos_motorista_empresa_ativo;

-- Dropar função antiga primeiro
DROP FUNCTION IF EXISTS public.gerar_contrato_atomico(uuid,text,text,text,text,text,text,text,text,text,date,date,integer,uuid);

-- Criar função simplificada que apenas insere contratos
CREATE FUNCTION public.gerar_contrato_atomico(
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
  created_at TIMESTAMPTZ
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Inserir novo contrato sem verificar duplicados
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
    contratos.criado_em;
END;
$$;