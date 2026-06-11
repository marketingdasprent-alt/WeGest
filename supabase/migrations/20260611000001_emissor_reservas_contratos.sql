-- ============================================================
-- Emissor de reservas e contratos de renting
-- ============================================================
-- A empresa emissora (cliente de tipo='empresa', mesmo eixo de
-- document_templates.cliente_empresa_id) passa a ser escolhida no
-- formulário da reserva/contrato e persistida na linha. Os dialogs
-- de "Gerar Documentos" usam este campo para resolver os templates
-- em vez de adivinhar (antes: primeira empresa da org).
--
-- Nullable na BD: linhas históricas ficam NULL (sem backfill — não
-- é possível inferir o emissor retroactivamente). A obrigatoriedade
-- é imposta na app: contrato sempre; reserva a partir de confirmada.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) Colunas novas
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS emissor_id uuid
    REFERENCES public.clientes(id) ON DELETE SET NULL;

ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS emissor_id uuid
    REFERENCES public.clientes(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.reservas.emissor_id IS
  'Empresa emissora (clientes.id com tipo_cliente=''empresa''). '
  'Os documentos gerados usam os templates desta empresa.';
COMMENT ON COLUMN public.contratos_renting.emissor_id IS
  'Empresa emissora (clientes.id com tipo_cliente=''empresa''). '
  'Herdado da reserva na conversão; os documentos usam os templates desta empresa.';

CREATE INDEX IF NOT EXISTS idx_reservas_emissor
  ON public.reservas (emissor_id)
  WHERE emissor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contratos_renting_emissor
  ON public.contratos_renting (emissor_id)
  WHERE emissor_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2) Imutabilidade de versões substituídas inclui o emissor
-- ────────────────────────────────────────────────────────────
-- Mesma função de 20260521000001, com emissor_id na lista de
-- colunas protegidas (versões históricas não podem mudar de emissor).

CREATE OR REPLACE FUNCTION public.fn_contratos_renting_versao_imutavel()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.substituido_em IS NOT NULL THEN
    -- Permite só alterar deleted_at (soft-delete administrativo) e
    -- updated_at/updated_by (refrescados por triggers internos).
    IF (NEW.tarifa_diaria          IS DISTINCT FROM OLD.tarifa_diaria)
       OR (NEW.desconto_percentagem IS DISTINCT FROM OLD.desconto_percentagem)
       OR (NEW.taxa_iva             IS DISTINCT FROM OLD.taxa_iva)
       OR (NEW.valor_total_manual   IS DISTINCT FROM OLD.valor_total_manual)
       OR (NEW.franquia_valor       IS DISTINCT FROM OLD.franquia_valor)
       OR (NEW.caucao_valor         IS DISTINCT FROM OLD.caucao_valor)
       OR (NEW.kms_incluidos        IS DISTINCT FROM OLD.kms_incluidos)
       OR (NEW.km_adicional_valor   IS DISTINCT FROM OLD.km_adicional_valor)
       OR (NEW.estado_operacional   IS DISTINCT FROM OLD.estado_operacional)
       OR (NEW.estado_financeiro    IS DISTINCT FROM OLD.estado_financeiro)
       OR (NEW.viatura_id           IS DISTINCT FROM OLD.viatura_id)
       OR (NEW.cliente_id           IS DISTINCT FROM OLD.cliente_id)
       OR (NEW.emissor_id           IS DISTINCT FROM OLD.emissor_id)
       OR (NEW.data_inicio          IS DISTINCT FROM OLD.data_inicio)
       OR (NEW.data_fim             IS DISTINCT FROM OLD.data_fim)
       OR (NEW.regime               IS DISTINCT FROM OLD.regime)
       OR (NEW.transferista_id      IS DISTINCT FROM OLD.transferista_id)
       OR (NEW.motivo_versao        IS DISTINCT FROM OLD.motivo_versao)
       OR (NEW.versao               IS DISTINCT FROM OLD.versao)
       OR (NEW.contrato_anterior_id IS DISTINCT FROM OLD.contrato_anterior_id)
    THEN
      RAISE EXCEPTION
        'Versão substituída de contrato é imutável. Cria uma nova versão se queres editar.'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3) RPC criar_versao_contrato_renting clona o emissor
-- ────────────────────────────────────────────────────────────
-- Base: versão canónica de 20260521000002 (marca a antiga como
-- substituída ANTES do insert, por causa do EXCLUDE anti-overbooking).
-- Única alteração: emissor_id na lista de colunas clonadas — sem isto,
-- upgrades/downgrades perdiam o emissor silenciosamente.

CREATE OR REPLACE FUNCTION public.criar_versao_contrato_renting(
  p_contrato_id uuid,
  p_motivo      text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old             contratos_renting%ROWTYPE;
  v_new_id          uuid;
  v_user_id         uuid := auth.uid();
BEGIN
  SELECT * INTO v_old
    FROM public.contratos_renting
   WHERE id = p_contrato_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % não encontrado.', p_contrato_id;
  END IF;

  IF v_old.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Não podes versionar um contrato eliminado.';
  END IF;

  IF v_old.substituido_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato já foi substituído. Versiona a versão actual.';
  END IF;

  IF v_old.estado_financeiro = 'facturado' THEN
    RAISE EXCEPTION 'Não podes versionar um contrato facturado. Anula a factura primeiro.';
  END IF;

  IF v_old.org_id <> get_current_org_id() THEN
    RAISE EXCEPTION 'Sem permissão sobre este contrato.';
  END IF;

  -- 1) Marca a antiga como substituída PRIMEIRO. Sai do espaço de
  --    unicidade do EXCLUDE anti-overbooking, libertando viatura+período
  --    para a nova versão.
  UPDATE public.contratos_renting
     SET substituido_em = now(),
         updated_by     = v_user_id
   WHERE id = v_old.id;

  -- 2) Cria a nova linha (clone, sem snapshots de total nem facturado_em)
  INSERT INTO public.contratos_renting (
    org_id, reserva_id, transferista_id, cliente_id, viatura_id, matricula, grupo,
    emissor_id,
    estacao_entrega_id, data_inicio, estacao_recolha_id, data_fim,
    estacao_origem_viatura_id,
    estado_operacional, estado_financeiro, origem, regime,
    tarifa_diaria, desconto_percentagem, taxa_iva, valor_total_manual,
    is_longa_duracao, renovacao_opcao, renovacao_intervalo_dias,
    franquia_valor, caucao_valor, kms_incluidos, km_adicional_valor,
    voucher_codigo, numero_processo, voo_referencia,
    local_entrega, local_recolha, comentarios_entrega, comentarios_recolha,
    observacoes, observacoes_internas,
    versao, contrato_anterior_id, motivo_versao,
    created_by
  )
  VALUES (
    v_old.org_id, v_old.reserva_id, v_old.transferista_id, v_old.cliente_id,
    v_old.viatura_id, v_old.matricula, v_old.grupo,
    v_old.emissor_id,
    v_old.estacao_entrega_id, v_old.data_inicio, v_old.estacao_recolha_id, v_old.data_fim,
    v_old.estacao_origem_viatura_id,
    v_old.estado_operacional, 'pendente', v_old.origem, v_old.regime,
    v_old.tarifa_diaria, v_old.desconto_percentagem, v_old.taxa_iva, v_old.valor_total_manual,
    v_old.is_longa_duracao, v_old.renovacao_opcao, v_old.renovacao_intervalo_dias,
    v_old.franquia_valor, v_old.caucao_valor, v_old.kms_incluidos, v_old.km_adicional_valor,
    v_old.voucher_codigo, v_old.numero_processo, v_old.voo_referencia,
    v_old.local_entrega, v_old.local_recolha, v_old.comentarios_entrega, v_old.comentarios_recolha,
    v_old.observacoes, v_old.observacoes_internas,
    v_old.versao + 1, v_old.id, p_motivo,
    v_user_id
  ) RETURNING id INTO v_new_id;

  -- 3) Copia condutores
  INSERT INTO public.contrato_condutores (
    org_id, contrato_id, cliente_id, motorista_id, is_principal
  )
  SELECT org_id, v_new_id, cliente_id, motorista_id, is_principal
    FROM public.contrato_condutores
   WHERE contrato_id = v_old.id;

  -- 4) Copia coberturas
  INSERT INTO public.contrato_coberturas (
    org_id, contrato_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
  )
  SELECT org_id, v_new_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
    FROM public.contrato_coberturas
   WHERE contrato_id = v_old.id;

  -- 5) Copia extras
  INSERT INTO public.contrato_extras (
    org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
  )
  SELECT org_id, v_new_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
    FROM public.contrato_extras
   WHERE contrato_id = v_old.id;

  -- 6) Copia taxas
  INSERT INTO public.contrato_taxas (
    org_id, contrato_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado
  )
  SELECT org_id, v_new_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado
    FROM public.contrato_taxas
   WHERE contrato_id = v_old.id;

  RETURN v_new_id;
END;
$$;
