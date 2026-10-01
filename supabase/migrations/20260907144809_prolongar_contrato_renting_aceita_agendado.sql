-- Prolongar passa a aceitar contratos AGENDADOS, não só em curso.
--
-- Porquê agora: os campos do contrato deixaram de se editar directamente no
-- formulário (ver camposTravados em ContratoForm) — um contrato agendado ficava
-- sem forma nenhuma de esticar a data de fim. Prolongar passa a ser essa via.
--
-- Fechado continua de fora: a viatura já foi recolhida, e mexer na data ali
-- arrastava o evento de recolha e a atribuição de um contrato terminado. Quem
-- se enganou no fecho reverte-o primeiro.
--
-- NOTA para quem lê o histórico: em produção a função nasceu de duas migrações
-- anteriores (20260904163246 e 20260904165949). O ficheiro
-- 20260904180000_prolongar_contrato_renting.sql deste repo cobre as duas e já
-- traz esta mesma condição, por ser CREATE OR REPLACE — em qualquer ordem de
-- aplicação o estado final é o mesmo.

CREATE OR REPLACE FUNCTION public.prolongar_contrato_renting(
  p_contrato_id   uuid,
  p_nova_data_fim timestamptz,
  p_valor_sem_iva numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_c contratos_renting%ROWTYPE; v_ultima contrato_cobrancas%ROWTYPE;
  v_conflito text; v_dias_extra integer; v_cobranca_id uuid;
BEGIN
  SELECT * INTO v_c FROM contratos_renting WHERE id = p_contrato_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato não encontrado.'; END IF;
  IF v_c.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Este contrato foi eliminado.'; END IF;
  IF v_c.org_id <> get_current_org_id() AND NOT is_decada_ousada_admin() THEN
    RAISE EXCEPTION 'Contrato de outra organização.'; END IF;
  IF v_c.substituido_em IS NOT NULL THEN
    RAISE EXCEPTION 'Esta versão do contrato foi substituída — prolonga a versão actual.'; END IF;
  IF v_c.regime <> 'rent_a_car' THEN
    RAISE EXCEPTION 'O prolongamento é só para contratos rent-a-car. Em TVDE o período avança pela renovação.'; END IF;
  IF v_c.estado_operacional NOT IN ('agendado', 'em_curso') THEN
    RAISE EXCEPTION 'Só se prolonga um contrato agendado ou em curso (este está %). Se o fecho foi engano, reverte-o primeiro.',
      v_c.estado_operacional; END IF;
  IF v_c.data_fim IS NULL THEN RAISE EXCEPTION 'Contrato sem data de fim — não há período para prolongar.'; END IF;
  IF p_nova_data_fim <= v_c.data_fim THEN
    RAISE EXCEPTION 'A nova data de fim (%) tem de ser posterior à actual (%).',
      to_char(p_nova_data_fim,'DD/MM/YYYY'), to_char(v_c.data_fim,'DD/MM/YYYY'); END IF;

  SELECT '#' || lpad(o.codigo::text,4,'0') INTO v_conflito FROM contratos_renting o
   WHERE o.id <> v_c.id AND o.org_id = v_c.org_id AND o.viatura_id = v_c.viatura_id
     AND o.deleted_at IS NULL AND o.substituido_em IS NULL
     AND o.estado_operacional IN ('agendado','em_curso')
     AND o.periodo && tstzrange(v_c.data_fim, p_nova_data_fim, '[)')
   ORDER BY o.data_inicio LIMIT 1;
  IF v_conflito IS NOT NULL THEN
    RAISE EXCEPTION 'A viatura já tem o contrato % nesse período. Prolonga só até ao início dele, ou trata desse contrato primeiro.', v_conflito; END IF;

  SELECT '#' || lpad(r.codigo::text,4,'0') INTO v_conflito FROM reservas r
   WHERE r.org_id = v_c.org_id AND r.viatura_id = v_c.viatura_id AND r.deleted_at IS NULL
     AND r.estado::text IN ('pendente','confirmada','em_curso')
     AND tstzrange(r.data_inicio, r.data_fim, '[)') && tstzrange(v_c.data_fim, p_nova_data_fim, '[)')
   ORDER BY r.data_inicio LIMIT 1;
  IF v_conflito IS NOT NULL THEN
    RAISE EXCEPTION 'A viatura já tem a reserva % nesse período. Prolonga só até ao início dela, ou trata dessa reserva primeiro.', v_conflito; END IF;

  v_dias_extra := fn_contrato_dias(v_c.data_fim, p_nova_data_fim);
  UPDATE contratos_renting SET data_fim = p_nova_data_fim, updated_at = now() WHERE id = p_contrato_id;

  IF p_valor_sem_iva IS NULL THEN RETURN NULL; END IF;
  IF p_valor_sem_iva < 0 THEN RAISE EXCEPTION 'O valor do prolongamento não pode ser negativo.'; END IF;
  IF v_c.estado_financeiro = 'anulado' THEN
    RAISE EXCEPTION 'A faturação deste contrato está anulada — refaz a faturação antes de cobrar dias extra.'; END IF;
  IF v_c.estado_financeiro NOT IN ('facturado','pago') THEN
    RAISE EXCEPTION 'Este contrato ainda não está faturado — os dias extra entram na fatura normal, não num documento à parte.'; END IF;

  SELECT * INTO v_ultima FROM contrato_cobrancas
   WHERE contrato_id = p_contrato_id AND estado <> 'anulada' ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato marcado como faturado mas sem nenhuma cobrança activa — verifica a faturação antes de prolongar.'; END IF;

  INSERT INTO contrato_cobrancas (
    org_id, contrato_id, periodo_de, periodo_ate, descricao,
    destinatario_id, destinatario_papel, destinatario_nome,
    valor_sem_iva, taxa_iva, emite_fatura_fiscal, estado, emitida_em, manual, tipo_cobranca
  ) VALUES (
    v_c.org_id, v_c.id, v_c.data_fim::date, p_nova_data_fim::date,
    'Prolongamento — ' || v_dias_extra || ' dia' || CASE WHEN v_dias_extra = 1 THEN '' ELSE 's' END
      || ' (' || to_char(v_c.data_fim,'DD/MM/YYYY') || ' a ' || to_char(p_nova_data_fim,'DD/MM/YYYY') || ')',
    v_ultima.destinatario_id, v_ultima.destinatario_papel, v_ultima.destinatario_nome,
    p_valor_sem_iva, COALESCE(v_c.taxa_iva, v_ultima.taxa_iva), true,
    'emitida', now(), true, v_ultima.tipo_cobranca
  ) RETURNING id INTO v_cobranca_id;
  RETURN v_cobranca_id;
END; $$;

REVOKE ALL ON FUNCTION public.prolongar_contrato_renting(uuid, timestamptz, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.prolongar_contrato_renting(uuid, timestamptz, numeric) TO authenticated;
