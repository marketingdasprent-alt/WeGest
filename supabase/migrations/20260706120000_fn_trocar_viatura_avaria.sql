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
-- anterior substituido_em) + UPDATE viatura_id/matricula/grupo, que dispara
-- sozinho toda a cascata já corrigida em 2026-07-03/06
-- (trg_contrato_renting_cascata_versao, trg_contrato_renting_liga_motorista_open/close,
-- trg_contratos_disponibilidade).
--
-- Valida que a viatura substituta pertence à mesma org do contrato (função é
-- SECURITY DEFINER e bypassa RLS). Sincroniza matricula/grupo com a viatura
-- nova — tal como ContratoForm.tsx faz na troca manual — porque `grupo` é
-- usado pela cascata para classificar troca-vs-upgrade (compara OLD.grupo
-- com NEW.grupo) e ficaria dessincronizado da viatura_id nova sem isto.
--
-- Não BLOQUEIA por grupo diferente aqui — grupo é só filtro/aviso na UI
-- (TicketSubstitutaModal), nunca bloqueio no backend. Isto evita duplicar a
-- regra "aviso vs bloqueio" em dois sítios.
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
  v_matricula_nova text;
  v_grupo_nova text;
BEGIN
  IF p_viatura_nova_id IS NULL THEN
    RAISE EXCEPTION 'p_viatura_nova_id é obrigatório.';
  END IF;

  IF p_viatura_nova_id = (
    SELECT viatura_id FROM public.contratos_renting WHERE id = p_contrato_id
  ) THEN
    RAISE EXCEPTION 'A viatura substituta é a mesma já associada ao contrato — nada a trocar.';
  END IF;

  -- Confirma que a viatura substituta pertence à mesma org do contrato
  -- (função é SECURITY DEFINER e bypassa RLS — sem isto, um contrato podia
  -- ser apontado para uma viatura de outra organização).
  -- `viaturas` não tem coluna `grupo` texto — só `grupo_id` (FK para
  -- renting_grupos). O snapshot `contratos_renting.grupo` é o `nome` do
  -- grupo, tal como ContratoForm.tsx faz (via.grupo_id → grupos.find → nome).
  SELECT v.matricula, rg.nome INTO v_matricula_nova, v_grupo_nova
  FROM public.viaturas v
  LEFT JOIN public.renting_grupos rg ON rg.id = v.grupo_id
  WHERE v.id = p_viatura_nova_id
    AND v.org_id = (SELECT org_id FROM public.contratos_renting WHERE id = p_contrato_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Viatura substituta não encontrada ou não pertence a esta organização.';
  END IF;

  v_nova_versao_id := public.criar_versao_contrato_renting(p_contrato_id, p_motivo);

  -- Sincroniza matricula/grupo com a viatura nova, tal como ContratoForm.tsx
  -- faz na troca manual — grupo é usado pela cascata para classificar
  -- troca-vs-upgrade, e matricula é snapshot histórico do contrato.
  UPDATE public.contratos_renting
     SET viatura_id = p_viatura_nova_id,
         matricula = v_matricula_nova,
         grupo = v_grupo_nova
   WHERE id = v_nova_versao_id;

  RETURN v_nova_versao_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_trocar_viatura_avaria(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_trocar_viatura_avaria(uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.fn_trocar_viatura_avaria(uuid, uuid, text) IS
  'Versiona um contrato_renting para uma viatura substituta (avaria). Valida que '
  'a viatura nova pertence à mesma org do contrato (SECURITY DEFINER bypassa RLS). '
  'Encapsula criar_versao_contrato_renting + UPDATE viatura_id/matricula/grupo '
  '(sincronizados com a viatura nova, tal como ContratoForm.tsx), disparando a '
  'cascata existente (calendário, motorista_viaturas, disponibilidade). Não '
  'bloqueia por grupo diferente — isso é responsabilidade da UI (filtro com '
  'aviso, não bloqueio).';
