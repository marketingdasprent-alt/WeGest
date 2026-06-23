-- ============================================================
-- Função merge_motoristas — funde fichas duplicadas
-- ============================================================
-- Move todas as dependências (32 tabelas FK) da ficha secundária para a
-- principal, consolida identificadores de plataforma (uber_uuid/bolt_id) e
-- dados de contacto, e elimina a ficha secundária.
--
-- Trata o índice idx_contratos_unique_active: se a principal já tem contrato
-- ativo numa empresa, os contratos ativos conflituantes da secundária passam
-- a 'substituido' antes de migrar (mantém 1 ativo por empresa).
--
-- Usada para limpar duplicados de motoristas (mesma pessoa, 2 fichas).
-- ============================================================

CREATE OR REPLACE FUNCTION public.merge_motoristas(p_principal uuid, p_secundaria uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_principal = p_secundaria THEN RETURN; END IF;

  UPDATE contratos sec
  SET status = 'substituido'
  WHERE sec.motorista_id = p_secundaria
    AND sec.status = 'ativo'
    AND EXISTS (
      SELECT 1 FROM contratos pri
      WHERE pri.motorista_id = p_principal
        AND pri.empresa_id = sec.empresa_id
        AND pri.status = 'ativo'
    );

  UPDATE assistencia_tickets        SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE bolt_drivers               SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE bolt_mapeamento_motoristas SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE bolt_resumos_semanais      SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE bolt_viagens               SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE bp_cartoes                 SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE bp_transacoes              SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE calendario_eventos         SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE contrato_condutores        SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE contratos                  SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE edp_transacoes             SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE motorista_custos_adicionais SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE motorista_documentos       SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE motorista_financeiro       SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE motorista_recibos          SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE motorista_viaturas         SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE recibos_importados         SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE reparacao_parcelas         SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE repsol_transacoes          SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE reserva_condutores         SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE reservas                   SET condutor_id  = p_principal WHERE condutor_id  = p_secundaria;
  UPDATE uber_driver_compliance     SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE uber_driver_profiles       SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE uber_driver_risk_profiles  SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE uber_driver_tokens         SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE uber_drivers               SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE uber_transactions          SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE uber_viagens               SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE viatura_danos              SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE viatura_multas             SET motorista_id = p_principal WHERE motorista_id = p_secundaria;
  UPDATE viatura_reparacoes         SET motorista_responsavel_id = p_principal WHERE motorista_responsavel_id = p_secundaria;
  UPDATE viatura_reservas           SET motorista_id = p_principal WHERE motorista_id = p_secundaria;

  UPDATE motoristas_ativos pri
  SET uber_uuid = COALESCE(pri.uber_uuid, sec.uber_uuid),
      bolt_id   = COALESCE(pri.bolt_id,   sec.bolt_id),
      iban      = COALESCE(pri.iban,       sec.iban),
      telefone  = COALESCE(pri.telefone,   sec.telefone),
      email     = COALESCE(pri.email,      sec.email)
  FROM motoristas_ativos sec
  WHERE pri.id = p_principal AND sec.id = p_secundaria;

  DELETE FROM motoristas_ativos WHERE id = p_secundaria;
END;
$$;
