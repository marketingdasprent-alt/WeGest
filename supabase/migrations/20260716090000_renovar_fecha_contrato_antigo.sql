-- ============================================================
-- Renovação FECHA o contrato antigo (badge "Fechado" = estado 'cancelado')
-- ============================================================
-- Até aqui, renovar_contrato_renting marcava o antigo como substituído
-- (substituido_em) mas deixava-o com estado_operacional 'em_curso' — no
-- histórico de versões o mês fechado aparecia "Em Curso" para sempre.
-- Passa a fechar-se com o km (km_saida/km_entrada já eram gravados) e nada
-- mais.
--
-- Para isso ser seguro, primeiro blindam-se as cascatas de estado com a regra
-- "HISTÓRIA É INERTE": mudar o estado_operacional de uma versão substituída
-- não pode fazer ripple no mundo vivo, porque o mundo vivo pertence agora ao
-- contrato sucessor:
--   · cascata_estado        — cancelaria a RESERVA (partilhada com o sucessor)
--                             e apagaria eventos já realizados (histórico).
--   · cascata_realizacao    — marcaria eventos realizados indevidamente.
--   · inativar_motorista    — desativaria o motorista que CONTINUA no sucessor.
--   · liga_motorista_close  — encerraria o vínculo motorista-viatura que agora
--                             pertence ao sucessor (guarda em OLD: no momento
--                             da substituição OLD.substituido_em ainda é NULL,
--                             por isso o fecho do vínculo na renovação/troca
--                             continua a acontecer como hoje).
-- ============================================================

-- ------------------------------------------------------------
-- 1a) cascata_estado: história é inerte
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_estado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_novo_estado_reserva text;
BEGIN
  -- Só age quando estado_operacional muda de facto.
  IF NEW.estado_operacional IS NOT DISTINCT FROM OLD.estado_operacional THEN
    RETURN NEW;
  END IF;

  -- Versões substituídas são história: fechar o antigo numa renovação não
  -- pode cascatear para a reserva (partilhada com o sucessor) nem apagar
  -- eventos já realizados.
  IF NEW.substituido_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Sem reserva associada, nada a cascatear (não devia acontecer mas
  -- defendemo-nos contra contratos legacy).
  IF NEW.reserva_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Mapear nova transição → estado da reserva
  IF NEW.estado_operacional = 'cancelado' AND OLD.estado_operacional = 'agendado' THEN
    -- Cancelado antes da entrega: cliente continua com reserva válida.
    v_novo_estado_reserva := 'confirmada';
  ELSIF NEW.estado_operacional = 'cancelado' AND OLD.estado_operacional = 'em_curso' THEN
    -- Cancelado durante uso: terminar tudo.
    v_novo_estado_reserva := 'cancelada';
  ELSIF NEW.estado_operacional = 'devolvido' THEN
    -- Ciclo terminado naturalmente.
    v_novo_estado_reserva := 'concluida';
  ELSE
    -- Outras transições (ex. agendado→em_curso) não exigem cascata
    -- sobre a reserva — ela já está 'em_curso' desde o INSERT.
    RETURN NEW;
  END IF;

  -- Aplicar transição na reserva
  UPDATE public.reservas
     SET estado = v_novo_estado_reserva::reserva_estado_enum
   WHERE id = NEW.reserva_id;

  -- Apagar eventos derivados SÓ quando o contrato é cancelado (compromisso
  -- que não se concretizou). Em 'devolvido' os eventos já foram realizados e
  -- mantêm-se como histórico — é o que alimenta o Relatório de Eventos.
  IF NEW.estado_operacional = 'cancelado' THEN
    DELETE FROM public.calendario_eventos
     WHERE origem_tipo = 'contrato_renting'
       AND origem_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------
-- 1b) cascata_realizacao: história é inerte
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contrato_renting_cascata_realizacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_evento_tipo text;
  v_actor       uuid;
BEGIN
  -- Só age em transições de estado_operacional
  IF NEW.estado_operacional IS NOT DISTINCT FROM OLD.estado_operacional THEN
    RETURN NEW;
  END IF;

  -- Versões substituídas são história: mudar-lhes o estado não marca eventos.
  IF NEW.substituido_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Mapeia transição → tipo de evento a marcar realizado
  v_evento_tipo := CASE
    WHEN OLD.estado_operacional = 'agendado'  AND NEW.estado_operacional = 'em_curso'  THEN 'entrega'
    WHEN OLD.estado_operacional = 'em_curso'  AND NEW.estado_operacional = 'devolvido' THEN 'recolha'
    ELSE NULL
  END;

  IF v_evento_tipo IS NULL THEN
    RETURN NEW;
  END IF;

  v_actor := COALESCE(NEW.updated_by, auth.uid());

  -- Marca o evento pendente correspondente. Se houver mais que um
  -- (não deveria), só toca no que ainda está por realizar.
  UPDATE public.calendario_eventos
     SET realizado_por_id = v_actor,
         realizado_em     = now()
   WHERE origem_tipo      = 'contrato_renting'
     AND origem_id        = NEW.id
     AND tipo             = v_evento_tipo
     AND realizado_em     IS NULL;

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------
-- 1c) inativar_motorista_na_devolucao: história é inerte
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contrato_renting_inativar_motorista_na_devolucao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.estado_operacional IS NOT DISTINCT FROM OLD.estado_operacional THEN
    RETURN NEW;
  END IF;

  -- Fechar uma versão substituída (ex.: renovação fecha o mês antigo) não é
  -- uma devolução real — o motorista continua no contrato sucessor.
  IF NEW.substituido_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Só age quando o contrato termina de facto (recolha/devolução
  -- confirmada). 'cancelado' cobre o fecho manual TVDE hoje; 'devolvido'
  -- cobre o fluxo normal de recolha via token.
  IF NEW.estado_operacional NOT IN ('cancelado', 'devolvido') THEN
    RETURN NEW;
  END IF;

  UPDATE public.motoristas_ativos
     SET status_ativo = false
   WHERE id IN (
     SELECT motorista_id
       FROM public.contrato_condutores
      WHERE contrato_id = NEW.id
        AND motorista_id IS NOT NULL
   );

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------
-- 1d) liga_motorista_close: linhas JÁ históricas não mexem no vínculo.
--     Guarda em OLD (não NEW): no momento da substituição OLD.substituido_em
--     ainda é NULL → o fecho do vínculo na renovação/troca mantém-se.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contrato_renting_liga_motorista_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_motorista_id uuid;
  v_tem_outro_contrato boolean;
BEGIN
  -- Linha já era história antes desta alteração: o vínculo motorista-viatura
  -- pertence agora ao contrato sucessor — não tocar.
  IF OLD.substituido_em IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.viatura_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.cliente_id IS NOT NULL THEN
    SELECT id INTO v_motorista_id
    FROM public.motoristas_ativos
    WHERE cliente_id = NEW.cliente_id
    LIMIT 1;
  END IF;

  IF v_motorista_id IS NULL THEN
    SELECT motorista_id INTO v_motorista_id
    FROM public.contrato_condutores
    WHERE contrato_id = NEW.id AND motorista_id IS NOT NULL
    LIMIT 1;
  END IF;

  IF v_motorista_id IS NULL THEN
    RAISE WARNING 'contrato_renting_liga_motorista_close: motorista não resolvido para contrato % (codigo %, cliente_id %, viatura_id %) — motorista_viaturas não sincronizado',
      NEW.id, NEW.codigo, NEW.cliente_id, NEW.viatura_id;
    RETURN NEW;
  END IF;

  UPDATE public.motorista_viaturas
     SET status = 'encerrado', data_fim = COALESCE(data_fim, CURRENT_DATE)
   WHERE motorista_id = v_motorista_id
     AND viatura_id = NEW.viatura_id
     AND status = 'ativo';

  -- Só inactiva se não houver outro contrato_renting activo (e não substituído)
  -- para este motorista, considerando os dois caminhos (cliente_id directo OU
  -- contrato_condutores.motorista_id).
  SELECT EXISTS (
    SELECT 1
    FROM public.contratos_renting cr
    WHERE cr.id <> NEW.id
      AND cr.deleted_at IS NULL
      AND cr.substituido_em IS NULL
      AND cr.estado_operacional IN ('agendado', 'em_curso')
      AND (
        EXISTS (
          SELECT 1 FROM public.motoristas_ativos ma
          WHERE ma.id = v_motorista_id AND ma.cliente_id = cr.cliente_id
        )
        OR EXISTS (
          SELECT 1 FROM public.contrato_condutores cc
          WHERE cc.contrato_id = cr.id AND cc.motorista_id = v_motorista_id
        )
      )
  ) INTO v_tem_outro_contrato;

  IF NOT v_tem_outro_contrato THEN
    UPDATE public.motoristas_ativos
       SET status_ativo = false
     WHERE id = v_motorista_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------
-- 2) renovar_contrato_renting: o antigo fecha ('cancelado' = "Fechado")
--    no mesmo UPDATE do substituido_em — nesse instante a linha ainda não é
--    imutável (OLD.substituido_em é NULL) e as cascatas acima já estão
--    guardadas (NEW.substituido_em fica preenchido).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.renovar_contrato_renting(
  p_contrato_id uuid,
  p_km_inicio integer DEFAULT NULL,
  p_km_fim integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old            public.contratos_renting%ROWTYPE;
  v_user_id        uuid := auth.uid();
  v_new_id         uuid;
  v_inicio         timestamptz;
  v_fim            timestamptz;
  v_km_percorridos integer;
  v_km_limite      integer;
  v_km_valor       numeric;
  v_km_excesso     integer;
  v_km_total       numeric;
  v_extra_km_id    uuid;
BEGIN
  SELECT * INTO v_old FROM public.contratos_renting WHERE id = p_contrato_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % não encontrado.', p_contrato_id;
  END IF;
  IF v_old.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato foi eliminado.';
  END IF;
  IF v_old.substituido_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato já foi renovado/substituído. Renova a versão actual.';
  END IF;
  IF v_old.org_id <> get_current_org_id() THEN
    RAISE EXCEPTION 'Sem permissão sobre este contrato.';
  END IF;
  IF NOT COALESCE(v_old.is_longa_duracao, false) THEN
    RAISE EXCEPTION 'A renovação só se aplica a contratos de longa duração.';
  END IF;
  IF v_old.data_fim IS NULL THEN
    RAISE EXCEPTION 'Contrato sem data de fim — não é possível calcular o novo período.';
  END IF;
  IF p_km_inicio IS NOT NULL AND p_km_fim IS NOT NULL AND p_km_fim < p_km_inicio THEN
    RAISE EXCEPTION 'O km final (%) não pode ser inferior ao km inicial (%).', p_km_fim, p_km_inicio;
  END IF;

  v_inicio := v_old.data_fim;
  v_fim    := public.proxima_data_renovacao(
                v_inicio, v_old.renovacao_opcao::text, v_old.renovacao_intervalo_dias);

  -- O mês que terminou passa a HISTÓRICO e FECHADO: só o estado e os km —
  -- não é uma devolução física, não há estação/fotos/combustível a registar.
  UPDATE public.contratos_renting
     SET substituido_em     = now(),
         estado_operacional = 'cancelado'::contrato_estado_operacional_enum,
         updated_by         = v_user_id,
         km_saida           = COALESCE(p_km_inicio, km_saida),
         km_entrada         = COALESCE(p_km_fim, km_entrada)
   WHERE id = v_old.id;

  IF p_km_fim IS NOT NULL AND v_old.viatura_id IS NOT NULL THEN
    UPDATE public.viaturas
       SET km_atual = p_km_fim
     WHERE id = v_old.viatura_id
       AND (km_atual IS NULL OR p_km_fim >= km_atual);
  END IF;

  INSERT INTO public.contratos_renting (
    org_id, reserva_id, transferista_id, cliente_id, emissor_id, gestor_id,
    viatura_id, matricula, grupo,
    estacao_entrega_id, data_inicio, estacao_recolha_id, data_fim, estacao_origem_viatura_id,
    estado_operacional, estado_financeiro, origem, regime,
    tarifa_diaria, tarifa_id, desconto_percentagem, taxa_iva, valor_total_manual,
    is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias,
    franquia_valor, caucao_valor, kms_incluidos, km_adicional_valor,
    km_saida,
    dua_original_com_motorista, dua_observacoes,
    voucher_codigo, numero_processo, voo_referencia,
    local_entrega, local_recolha, comentarios_entrega, comentarios_recolha,
    observacoes, observacoes_internas,
    versao, contrato_anterior_id, motivo_versao,
    created_by
  )
  VALUES (
    v_old.org_id, v_old.reserva_id, v_old.transferista_id, v_old.cliente_id, v_old.emissor_id, v_old.gestor_id,
    v_old.viatura_id, v_old.matricula, v_old.grupo,
    v_old.estacao_entrega_id, v_inicio, v_old.estacao_recolha_id, v_fim, v_old.estacao_origem_viatura_id,
    v_old.estado_operacional, 'pendente', v_old.origem, v_old.regime,
    v_old.tarifa_diaria, v_old.tarifa_id, v_old.desconto_percentagem, v_old.taxa_iva, v_old.valor_total_manual,
    v_old.is_longa_duracao, v_old.renovacao_opcao, v_old.renovacao_intervalo_dias,
    v_old.franquia_valor, v_old.caucao_valor, v_old.kms_incluidos, v_old.km_adicional_valor,
    p_km_fim,
    v_old.dua_original_com_motorista, v_old.dua_observacoes,
    v_old.voucher_codigo, v_old.numero_processo, v_old.voo_referencia,
    v_old.local_entrega, v_old.local_recolha, v_old.comentarios_entrega, v_old.comentarios_recolha,
    v_old.observacoes, v_old.observacoes_internas,
    v_old.versao + 1, v_old.id,
    'Renovação — período de ' || to_char(v_inicio, 'YYYY-MM-DD') || ' a ' || to_char(v_fim, 'YYYY-MM-DD'),
    v_user_id
  ) RETURNING id INTO v_new_id;

  INSERT INTO public.contrato_condutores (org_id, contrato_id, cliente_id, motorista_id, is_principal)
  SELECT org_id, v_new_id, cliente_id, motorista_id, is_principal
    FROM public.contrato_condutores WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_coberturas (org_id, contrato_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor)
  SELECT org_id, v_new_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
    FROM public.contrato_coberturas WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_extras (org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total)
  SELECT org_id, v_new_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
    FROM public.contrato_extras WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_taxas (org_id, contrato_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado)
  SELECT org_id, v_new_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado
    FROM public.contrato_taxas WHERE contrato_id = v_old.id;

  IF p_km_inicio IS NOT NULL AND p_km_fim IS NOT NULL
     AND v_old.kms_incluidos IS NOT NULL THEN
    v_km_percorridos := p_km_fim - p_km_inicio;
    v_km_limite      := v_old.kms_incluidos;
    v_km_valor       := COALESCE(v_old.km_adicional_valor, 0);

    IF v_km_percorridos > v_km_limite AND v_km_valor > 0 THEN
      v_km_excesso := v_km_percorridos - v_km_limite;
      v_km_total   := v_km_excesso * v_km_valor;

      SELECT id INTO v_extra_km_id
        FROM public.renting_extras
       WHERE org_id = v_old.org_id AND nome = 'Km excedente'
       LIMIT 1;

      IF v_extra_km_id IS NULL THEN
        INSERT INTO public.renting_extras (org_id, nome, descricao, preco_unidade, tipo_calculo, ativo, created_by)
        VALUES (v_old.org_id, 'Km excedente',
                'Km acima do limite mensal — gerado automaticamente na renovação.',
                0, 'fixo', true, v_user_id)
        RETURNING id INTO v_extra_km_id;
      END IF;

      INSERT INTO public.contrato_extras (
        org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
      )
      VALUES (
        v_old.org_id, v_old.id, v_extra_km_id,
        'Km excedente (' || v_km_excesso || ' km × ' || to_char(v_km_valor, 'FM999990.00') || ' €)',
        v_km_valor, 'fixo', v_km_excesso, v_km_total
      );
    END IF;
  END IF;

  DELETE FROM public.calendario_eventos
   WHERE origem_tipo = 'contrato_renting'
     AND origem_id   = v_new_id
     AND tipo IN ('entrega', 'recolha')
     AND realizado_em IS NULL;

  RETURN v_new_id;
END;
$function$;

-- ------------------------------------------------------------
-- 3) Backfill: os antigos JÁ renovados que ficaram 'em_curso' passam a
--    'cancelado' ("Fechado"). Identificados pelo sucessor com motivo
--    'Renovação…'. A imutabilidade de versões bloqueia mudanças de estado
--    em linhas substituídas — desliga-se SÓ para esta correcção pontual
--    (as cascatas guardadas acima continuam ativas e inertes).
-- ------------------------------------------------------------
ALTER TABLE public.contratos_renting DISABLE TRIGGER trg_contratos_renting_versao_imutavel;

UPDATE public.contratos_renting velho
   SET estado_operacional = 'cancelado'::contrato_estado_operacional_enum
 WHERE velho.substituido_em IS NOT NULL
   AND velho.deleted_at IS NULL
   AND velho.estado_operacional = 'em_curso'
   AND EXISTS (
     SELECT 1 FROM public.contratos_renting novo
      WHERE novo.contrato_anterior_id = velho.id
        AND novo.motivo_versao ILIKE 'Renova%'
   );

ALTER TABLE public.contratos_renting ENABLE TRIGGER trg_contratos_renting_versao_imutavel;
