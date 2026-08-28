-- ============================================================
-- Conflito de disponibilidade: ignorar versões substituídas
-- ============================================================
-- contrato_tem_conflito() contava as versões ANTIGAS do próprio contrato
-- (substituido_em preenchido, mas ainda 'agendado') como se fossem contratos
-- activos a ocupar a viatura — dando um falso "Conflito de disponibilidade"
-- ao gravar a versão atual (o contrato chocava consigo próprio).
--
-- A lista de contratos e o check de overbooking já ignoram `substituido_em`;
-- esta função ficou de fora. Alinhamos: uma versão substituída não ocupa a
-- viatura. Aditivo/idempotente (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION public.contrato_tem_conflito(
  p_viatura_id  uuid,
  p_data_inicio timestamptz,
  p_data_fim    timestamptz,
  p_excluir_id  uuid DEFAULT NULL,
  p_reserva_id  uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    -- Outros contratos activos (ignora versões substituídas: não ocupam viatura)
    SELECT 1 FROM public.contratos_renting
    WHERE org_id = public.get_current_org_id()
      AND viatura_id = p_viatura_id
      AND deleted_at IS NULL
      AND substituido_em IS NULL
      AND estado_operacional IN ('agendado', 'em_curso')
      AND periodo && tstzrange(p_data_inicio, p_data_fim, '[)')
      AND (p_excluir_id IS NULL OR id <> p_excluir_id)
    UNION ALL
    -- Reservas activas (excepto a que originou este contrato)
    SELECT 1 FROM public.reservas
    WHERE org_id = public.get_current_org_id()
      AND viatura_id = p_viatura_id
      AND deleted_at IS NULL
      AND estado IN ('pendente', 'confirmada', 'em_curso')
      AND periodo && tstzrange(p_data_inicio, p_data_fim, '[)')
      AND (p_reserva_id IS NULL OR id <> p_reserva_id)
  );
$function$;
