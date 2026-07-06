-- ============================================================
-- RPC: troca de viatura por avaria (mesmo grupo, com escape manual)
-- ============================================================
-- Liga a atribuição de viatura substituta (ticket de Assistência) ao
-- versionamento de contratos_renting já existente. Sem isto, o contrato
-- continuava a apontar para a viatura avariada enquanto o motorista
-- conduzia a substituta — sem evento de calendário, sem sincronizar
-- motorista_viaturas, sem recalcular disponibilidade.
--
-- Reusa criar_versao_contrato_renting (clona a linha activa, marca a
-- anterior substituido_em) + UPDATE viatura_id, que dispara sozinho toda
-- a cascata já corrigida em 2026-07-03/06 (trg_contrato_renting_cascata_versao,
-- trg_contrato_renting_liga_motorista_open/close, trg_contratos_disponibilidade).
--
-- Não valida grupo aqui — grupo é só filtro/aviso na UI (TicketSubstitutaModal),
-- nunca bloqueio no backend. Isto evita duplicar a regra "aviso vs bloqueio"
-- em dois sítios.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_trocar_viatura_avaria(
  p_contrato_id uuid,
  p_viatura_nova_id uuid,
  p_motivo text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nova_versao_id uuid;
BEGIN
  IF p_viatura_nova_id IS NULL THEN
    RAISE EXCEPTION 'p_viatura_nova_id é obrigatório.';
  END IF;

  v_nova_versao_id := public.criar_versao_contrato_renting(p_contrato_id, p_motivo);

  UPDATE public.contratos_renting
     SET viatura_id = p_viatura_nova_id
   WHERE id = v_nova_versao_id;

  RETURN v_nova_versao_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_trocar_viatura_avaria(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_trocar_viatura_avaria(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.fn_trocar_viatura_avaria(uuid, uuid, text) IS
  'Versiona um contrato_renting para uma viatura substituta (avaria). Encapsula '
  'criar_versao_contrato_renting + UPDATE viatura_id, disparando a cascata '
  'existente (calendário, motorista_viaturas, disponibilidade). Não valida grupo '
  '— isso é responsabilidade da UI (filtro com aviso, não bloqueio).';
