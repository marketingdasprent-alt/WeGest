-- Prolongar um contrato: esticar a data de fim do MESMO contrato e cobrar os
-- dias a mais num documento à parte.
--
-- Não confundir com renovar (renovar_contrato_renting), que fecha o período e
-- abre outro com código novo — é o ciclo mensal da longa duração. Prolongar é
-- "o cliente ficou com o carro mais três dias": mesmo contrato, mesmo código,
-- mais dias.
--
-- PORQUE É UMA RPC E NÃO DOIS PEDIDOS DO ECRÃ
--
-- A data e a cobrança têm de ficar na mesma transação. Separadas, um erro entre
-- as duas deixa o contrato esticado sem fatura — dias cedidos que ninguém
-- cobra, e ninguém dá por isso.
--
-- PORQUE UMA COBRANÇA NOVA E NÃO O AUMENTO DA EXISTENTE
--
-- Num contrato já faturado os totais estão congelados por compliance SAF-T
-- (fn_contratos_renting_freeze_totals) e a cobrança emitida é imutável
-- (fn_contrato_cobranca_protege recusa mexer no período ou no valor). O
-- prolongamento é um documento novo, marcado `manual = true` — que é também o
-- que o deixa escapar ao índice único de período.

CREATE OR REPLACE FUNCTION public.prolongar_contrato_renting(
  p_contrato_id   uuid,
  p_nova_data_fim timestamptz,
  -- NULL = só estica a data, não emite nada. É o caso do contrato ainda por
  -- faturar, onde a faturação normal já vai cobrir o período todo.
  p_valor_sem_iva numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_c             contratos_renting%ROWTYPE;
  v_ultima        contrato_cobrancas%ROWTYPE;
  v_conflito      text;
  v_dias_extra    integer;
  v_cobranca_id   uuid;
BEGIN
  SELECT * INTO v_c FROM contratos_renting WHERE id = p_contrato_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato não encontrado.';
  END IF;

  IF v_c.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato foi eliminado.';
  END IF;

  IF v_c.org_id <> get_current_org_id() AND NOT is_decada_ousada_admin() THEN
    RAISE EXCEPTION 'Contrato de outra organização.';
  END IF;

  -- História é inerte: uma versão substituída não se altera (ver
  -- fn_contratos_renting_versao_imutavel, que bloquearia o UPDATE de qualquer
  -- forma — apanha-se aqui para a mensagem ser accionável).
  IF v_c.substituido_em IS NOT NULL THEN
    RAISE EXCEPTION 'Esta versão do contrato foi substituída — prolonga a versão actual.';
  END IF;

  IF v_c.regime <> 'rent_a_car' THEN
    RAISE EXCEPTION 'O prolongamento é só para contratos rent-a-car. Em TVDE o período avança pela renovação.';
  END IF;

  -- Exige 'em_curso', como a renovação (ver renovacao_exige_em_curso):
  -- prolongar pressupõe que o carro está com o cliente. Num contrato fechado a
  -- viatura já foi recolhida e mexer na data arrastava o evento de recolha e a
  -- atribuição de um contrato terminado; num agendado o período nem começou.
  IF v_c.estado_operacional <> 'em_curso' THEN
    RAISE EXCEPTION 'Só se prolonga um contrato em curso (este está %). Se o fecho foi engano, reverte-o primeiro.',
      v_c.estado_operacional;
  END IF;

  IF v_c.data_fim IS NULL THEN
    RAISE EXCEPTION 'Contrato sem data de fim — não há período para prolongar.';
  END IF;

  IF p_nova_data_fim <= v_c.data_fim THEN
    RAISE EXCEPTION 'A nova data de fim (%) tem de ser posterior à actual (%).',
      to_char(p_nova_data_fim, 'DD/MM/YYYY'), to_char(v_c.data_fim, 'DD/MM/YYYY');
  END IF;

  -- Sobreposição com OUTRO contrato da mesma viatura. A constraint
  -- contratos_no_overbooking já impediria o UPDATE, mas com um 23P01 que
  -- ninguém percebe — aqui diz-se qual é o contrato que está à frente.
  SELECT '#' || lpad(o.codigo::text, 4, '0') INTO v_conflito
    FROM contratos_renting o
   WHERE o.id <> v_c.id
     AND o.org_id = v_c.org_id
     AND o.viatura_id = v_c.viatura_id
     AND o.deleted_at IS NULL
     AND o.substituido_em IS NULL
     AND o.estado_operacional IN ('agendado', 'em_curso')
     AND o.periodo && tstzrange(v_c.data_fim, p_nova_data_fim, '[)')
   ORDER BY o.data_inicio
   LIMIT 1;
  IF v_conflito IS NOT NULL THEN
    RAISE EXCEPTION 'A viatura já tem o contrato % nesse período. Prolonga só até ao início dele, ou trata desse contrato primeiro.', v_conflito;
  END IF;

  -- Sobreposição com uma RESERVA da mesma viatura. Não há constraint para isto
  -- (a reserva vive noutra tabela), por isso é aqui que se apanha.
  SELECT '#' || lpad(r.codigo::text, 4, '0') INTO v_conflito
    FROM reservas r
   WHERE r.org_id = v_c.org_id
     AND r.viatura_id = v_c.viatura_id
     AND r.deleted_at IS NULL
     AND r.estado::text IN ('pendente', 'confirmada', 'em_curso')
     AND tstzrange(r.data_inicio, r.data_fim, '[)') && tstzrange(v_c.data_fim, p_nova_data_fim, '[)')
   ORDER BY r.data_inicio
   LIMIT 1;
  IF v_conflito IS NOT NULL THEN
    RAISE EXCEPTION 'A viatura já tem a reserva % nesse período. Prolonga só até ao início dela, ou trata dessa reserva primeiro.', v_conflito;
  END IF;

  v_dias_extra := fn_contrato_dias(v_c.data_fim, p_nova_data_fim);

  -- A partir daqui é tudo ou nada. Mover a data dispara sozinho o arrasto do
  -- evento de recolha no calendário (contrato_renting_cascata_data_fim) e do
  -- fim da atribuição da viatura (fn_contrato_sincroniza_atribuicao).
  UPDATE contratos_renting
     SET data_fim = p_nova_data_fim,
         updated_at = now()
   WHERE id = p_contrato_id;

  IF p_valor_sem_iva IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_valor_sem_iva < 0 THEN
    RAISE EXCEPTION 'O valor do prolongamento não pode ser negativo.';
  END IF;

  -- Só se emite documento sobre um contrato já faturado (ou já pago — mais
  -- faturado do que isso não há). Num contrato ainda pendente, faturar os dias
  -- extra à parte cobrava-os duas vezes: a faturação normal conta o período
  -- todo, já esticado.
  IF v_c.estado_financeiro = 'anulado' THEN
    RAISE EXCEPTION 'A faturação deste contrato está anulada — refaz a faturação antes de cobrar dias extra.';
  END IF;
  IF v_c.estado_financeiro NOT IN ('facturado', 'pago') THEN
    RAISE EXCEPTION 'Este contrato ainda não está faturado — os dias extra entram na fatura normal, não num documento à parte.';
  END IF;

  -- O destinatário é o mesmo da última cobrança viva do contrato: prolongar não
  -- é altura de mudar quem paga.
  SELECT * INTO v_ultima
    FROM contrato_cobrancas
   WHERE contrato_id = p_contrato_id
     AND estado <> 'anulada'
   ORDER BY created_at DESC
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato marcado como faturado mas sem nenhuma cobrança activa — verifica a faturação antes de prolongar.';
  END IF;

  INSERT INTO contrato_cobrancas (
    org_id, contrato_id, periodo_de, periodo_ate, descricao,
    destinatario_id, destinatario_papel, destinatario_nome,
    valor_sem_iva, taxa_iva, emite_fatura_fiscal,
    estado, emitida_em, manual, tipo_cobranca
  ) VALUES (
    v_c.org_id, v_c.id, v_c.data_fim::date, p_nova_data_fim::date,
    'Prolongamento — ' || v_dias_extra || ' dia' || CASE WHEN v_dias_extra = 1 THEN '' ELSE 's' END
      || ' (' || to_char(v_c.data_fim, 'DD/MM/YYYY') || ' a ' || to_char(p_nova_data_fim, 'DD/MM/YYYY') || ')',
    v_ultima.destinatario_id, v_ultima.destinatario_papel, v_ultima.destinatario_nome,
    p_valor_sem_iva, COALESCE(v_c.taxa_iva, v_ultima.taxa_iva), true,
    -- 'emitida' porque o trigger de conta-corrente é que lança o débito.
    'emitida', now(), true,
    -- O CHECK só aceita 'tvde_semanal' ou 'slot_mensal'; herda-se o da cobrança
    -- anterior. O que descreve isto para um humano é a `descricao`.
    v_ultima.tipo_cobranca
  ) RETURNING id INTO v_cobranca_id;

  RETURN v_cobranca_id;
END;
$$;

COMMENT ON FUNCTION public.prolongar_contrato_renting(uuid, timestamptz, numeric) IS
  'Estica a data de fim de um contrato rent-a-car e, se o contrato já estiver faturado, cria a cobrança manual dos dias extra. Data e cobrança na mesma transação. Devolve o id da cobrança, ou NULL quando só estica.';

REVOKE ALL ON FUNCTION public.prolongar_contrato_renting(uuid, timestamptz, numeric) FROM anon;
GRANT EXECUTE ON FUNCTION public.prolongar_contrato_renting(uuid, timestamptz, numeric) TO authenticated;
