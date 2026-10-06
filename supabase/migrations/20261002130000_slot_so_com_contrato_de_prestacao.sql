-- Slot só tem contrato de prestação de serviços; nunca contrato de renting (TVDE/rent-a-car).
--
-- A 02/10/2026 o contrato #455 (André, reserva Slot a 125 €/mês) mostrava 275 € por semana:
-- o preço TVDE do modelo, usado como estimativa por um contrato TVDE agendado preso à reserva
-- Slot. O trigger antigo só olhava para o regime do próprio contrato, por isso 83 contratos
-- TVDE passaram a pendurar-se em reservas Slot.
--
-- 1) Bloqueia contrato de renting numa reserva Slot, e reserva que passa a Slot com contrato vivo.
-- 2) A geração de cobranças TVDE semanais ignora reservas Slot.
-- 3) Reservas Slot em curso com motorista passam a ter contrato de prestação, e os contratos
--    TVDE vivos delas saem de cena (soft delete) sem fechar o vínculo motorista-viatura.
--    Contratos já fechados/cancelados e cobranças antigas ficam como estão.

-- 1a) Contrato de renting não nasce numa reserva Slot.
CREATE OR REPLACE FUNCTION public.fn_rejeitar_contrato_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.regime = 'slot' THEN
    RAISE EXCEPTION 'Regime slot não gera contrato_renting — usa o contrato de prestação de serviços.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.reserva_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.reservas r WHERE r.id = NEW.reserva_id AND r.regime = 'slot'
  ) THEN
    RAISE EXCEPTION 'Reserva Slot não gera contrato de renting — usa o contrato de prestação de serviços.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_rejeitar_contrato_slot() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_rejeitar_contrato_slot ON public.contratos_renting;
CREATE TRIGGER trg_rejeitar_contrato_slot
  BEFORE INSERT OR UPDATE OF regime, reserva_id ON public.contratos_renting
  FOR EACH ROW EXECUTE FUNCTION public.fn_rejeitar_contrato_slot();

-- 1b) Reserva não passa a Slot enquanto tiver contrato de renting vivo.
CREATE OR REPLACE FUNCTION public.fn_reserva_slot_sem_contrato_renting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.regime = 'slot' AND OLD.regime IS DISTINCT FROM 'slot' AND EXISTS (
    SELECT 1 FROM public.contratos_renting c
     WHERE c.reserva_id = NEW.id
       AND c.deleted_at IS NULL
       AND c.substituido_em IS NULL
       AND c.estado_operacional IN ('agendado', 'em_curso')
  ) THEN
    RAISE EXCEPTION 'A reserva tem um contrato de renting vivo — fecha-o antes de a passar a Slot.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_reserva_slot_sem_contrato_renting() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_reserva_slot_sem_contrato_renting ON public.reservas;
CREATE TRIGGER trg_reserva_slot_sem_contrato_renting
  BEFORE UPDATE OF regime ON public.reservas
  FOR EACH ROW EXECUTE FUNCTION public.fn_reserva_slot_sem_contrato_renting();

-- 2) Cobranças TVDE semanais: reservas Slot ficam de fora.
CREATE OR REPLACE FUNCTION public.gerar_cobrancas_tvde_semanais(p_semanas_a_frente integer DEFAULT 1)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contrato      record;
  v_condutor      record;
  v_tarifa        record;
  v_cliente       record;
  v_preco_semana  numeric;
  v_proximo_de    date;
  v_proximo_ate   date;
  v_limite        date;
  v_ultima        date;
  v_criadas       integer := 0;
  v_rowcount      integer;
BEGIN
  v_limite := current_date + (GREATEST(p_semanas_a_frente, 0) * 7);

  FOR v_contrato IN
    SELECT c.* FROM public.contratos_renting c
    WHERE c.regime = 'tvde'
      AND c.deleted_at IS NULL
      AND c.estado_operacional IN ('agendado', 'em_curso')
      AND NOT EXISTS (
        SELECT 1 FROM public.reservas r WHERE r.id = c.reserva_id AND r.regime = 'slot'
      )
  LOOP
    SELECT max(periodo_ate) INTO v_ultima
    FROM public.contrato_cobrancas
    WHERE contrato_id = v_contrato.id;

    v_proximo_de := COALESCE(v_ultima + 1, v_contrato.data_inicio::date);

    -- Tarifa do contrato. Se não tiver preço direto (caso das tarifas tvde,
    -- que são por modelo), resolve via renting_tarifa_precos_modelo usando
    -- o modelo da viatura do contrato.
    SELECT * INTO v_tarifa
    FROM public.renting_tarifas WHERE id = v_contrato.tarifa_id;

    v_preco_semana := v_tarifa.preco_semana;
    IF v_preco_semana IS NULL AND v_contrato.viatura_id IS NOT NULL THEN
      SELECT rtpm.preco_semana INTO v_preco_semana
      FROM public.renting_tarifa_precos_modelo rtpm
      JOIN public.viaturas vi ON vi.modelo_id = rtpm.modelo_id
      WHERE rtpm.tarifa_id = v_tarifa.id
        AND vi.id = v_contrato.viatura_id;
    END IF;

    WHILE v_proximo_de <= v_limite LOOP
      v_proximo_ate := v_proximo_de + 6;

      EXIT WHEN v_contrato.data_fim IS NOT NULL
            AND v_proximo_de > v_contrato.data_fim::date;

      SELECT cc.* INTO v_condutor
      FROM public.contrato_condutores cc
      WHERE cc.contrato_id = v_contrato.id
        AND cc.is_principal = true
        AND cc.vigencia @> v_proximo_de::timestamptz
      LIMIT 1;

      IF FOUND AND v_preco_semana IS NOT NULL THEN
        SELECT * INTO v_cliente FROM public.clientes WHERE id = v_condutor.cliente_id;

        INSERT INTO public.contrato_cobrancas (
          org_id, contrato_id, periodo_de, periodo_ate, descricao,
          destinatario_id, destinatario_papel, destinatario_nome, contrato_condutor_id,
          tarifa_id, tarifa_nome,
          valor_sem_iva, taxa_iva, emite_fatura_fiscal, estado
        )
        VALUES (
          v_contrato.org_id, v_contrato.id, v_proximo_de, v_proximo_ate,
          'Semana ' || to_char(v_proximo_de, 'DD/MM') ||
                ' a ' || to_char(v_proximo_ate, 'DD/MM/YYYY'),
          v_condutor.cliente_id, 'condutor', v_cliente.nome, v_condutor.id,
          v_tarifa.id, v_tarifa.nome,
          v_preco_semana, COALESCE(v_contrato.taxa_iva, 23),
          false, 'pendente'
        )
        ON CONFLICT (contrato_id, destinatario_id, periodo_de, periodo_ate)
        DO NOTHING;

        GET DIAGNOSTICS v_rowcount = ROW_COUNT;
        IF v_rowcount > 0 THEN
          v_criadas := v_criadas + 1;
        END IF;
      END IF;

      v_proximo_de := v_proximo_ate + 1;
    END LOOP;
  END LOOP;

  RETURN v_criadas;
END;
$function$;

-- 3) Reservas Slot em curso com motorista: contrato de prestação + retirada dos contratos TVDE vivos.
-- Função à parte para se poder testar e voltar a chamar (idempotente). Devolve os contratos retirados.
CREATE OR REPLACE FUNCTION public.migrar_reservas_slot_para_prestacao()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_retirados integer;
BEGIN
  -- Primeiro a prestação, para o vínculo ficar registado antes de o contrato TVDE sair.
  INSERT INTO public.contratos_prestacao (
    org_id, motorista_id, viatura_id, reserva_id, data_inicio, valor_semanal, estado,
    motorista_nome, motorista_nif, motorista_morada, motorista_email, motorista_telefone, observacoes
  )
  SELECT r.org_id, r.condutor_id, r.viatura_id, r.id, r.data_inicio::date, r.slot_valor_mensal, 'ativo',
         m.nome, m.nif, m.morada, m.email, m.telefone,
         'Criado na migração do Slot (02/10/2026): o Slot passou a ter só contrato de prestação.'
    FROM public.reservas r
    JOIN public.motoristas_ativos m ON m.id = r.condutor_id
   WHERE r.regime = 'slot'
     AND r.estado = 'em_curso'
     AND r.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.contratos_prestacao p
        WHERE p.deleted_at IS NULL AND p.estado = 'ativo'
          AND (p.reserva_id = r.id
               OR (p.motorista_id = r.condutor_id AND p.viatura_id IS NOT DISTINCT FROM r.viatura_id))
     );

  -- Soft delete, não cancelamento: cancelar arrastava a reserva para "cancelada" e parava a
  -- mensalidade do Slot. O trigger de fecho do vínculo fica desligado: o motorista continua com a viatura.
  ALTER TABLE public.contratos_renting DISABLE TRIGGER trg_contrato_renting_liga_motorista_close;

  UPDATE public.contratos_renting c
     SET deleted_at = now()
    FROM public.reservas r
   WHERE r.id = c.reserva_id
     AND r.regime = 'slot'
     AND r.estado = 'em_curso'
     AND r.condutor_id IS NOT NULL
     AND r.deleted_at IS NULL
     AND c.deleted_at IS NULL
     AND c.substituido_em IS NULL
     AND c.estado_operacional IN ('agendado', 'em_curso');
  GET DIAGNOSTICS v_retirados = ROW_COUNT;

  ALTER TABLE public.contratos_renting ENABLE TRIGGER trg_contrato_renting_liga_motorista_close;

  RETURN v_retirados;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.migrar_reservas_slot_para_prestacao() FROM PUBLIC, anon, authenticated;

SELECT public.migrar_reservas_slot_para_prestacao();

NOTIFY pgrst, 'reload schema';
