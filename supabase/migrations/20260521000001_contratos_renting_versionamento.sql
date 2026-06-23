-- ============================================================
-- Versionamento de contratos_renting (upgrade/downgrade)
-- ============================================================
-- Quando um cliente muda de viatura ou plano a meio do contrato
-- (upgrade Compact → Premium, downgrade, mudança de regime, etc.),
-- precisamos de preservar o estado anterior por motivos fiscais e
-- de auditoria, sem perder histórico.
--
-- Modelo: cada versão é uma LINHA NOVA em contratos_renting com
--   versao = versao_anterior + 1
--   contrato_anterior_id = FK para a linha anterior
--   substituido_em = NULL na versão actual, NOW() nas anteriores
--   motivo_versao = texto explicativo
--
-- Apenas a versão actual ocupa a reserva (UNIQUE parcial muda).
-- Versões anteriores ficam imutáveis (trigger novo).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) Colunas novas
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS contrato_anterior_id uuid
    REFERENCES public.contratos_renting(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS substituido_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_versao text;

COMMENT ON COLUMN public.contratos_renting.versao IS
  'Número da versão. Começa em 1. Incrementa em cada upgrade/downgrade.';
COMMENT ON COLUMN public.contratos_renting.contrato_anterior_id IS
  'FK self-referencial para a versão anterior. NULL na versão original.';
COMMENT ON COLUMN public.contratos_renting.substituido_em IS
  'NULL = versão actual. NOT NULL = foi substituído nesta data por uma nova versão.';
COMMENT ON COLUMN public.contratos_renting.motivo_versao IS
  'Razão da nova versão (ex. "upgrade Compact → Premium", "mudança de regime").';

CREATE INDEX IF NOT EXISTS idx_contratos_renting_anterior
  ON public.contratos_renting (contrato_anterior_id)
  WHERE contrato_anterior_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contratos_renting_versao_actual
  ON public.contratos_renting (reserva_id)
  WHERE substituido_em IS NULL AND deleted_at IS NULL;

-- ────────────────────────────────────────────────────────────
-- 2) UNIQUE parcial para reserva_id — só versão actual ocupa a reserva
-- ────────────────────────────────────────────────────────────
-- O índice antigo (criado em 20260518000012) considerava apenas
-- deleted_at. Agora também tem de excluir versões substituídas.

DROP INDEX IF EXISTS public.uq_contratos_renting_reserva_id_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contratos_renting_reserva_id_active
  ON public.contratos_renting (reserva_id)
  WHERE deleted_at IS NULL AND substituido_em IS NULL;

COMMENT ON INDEX public.uq_contratos_renting_reserva_id_active IS
  'UNIQUE parcial: 1 reserva = no máximo 1 contrato ACTIVO e NÃO substituído.';

-- ────────────────────────────────────────────────────────────
-- 3) Imutabilidade de versões substituídas
-- ────────────────────────────────────────────────────────────
-- Uma vez marcada `substituido_em IS NOT NULL`, a linha vira histórico
-- e não pode ser editada — só o `deleted_at` continua mutável para
-- permitir purga administrativa.

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

DROP TRIGGER IF EXISTS trg_contratos_renting_versao_imutavel ON public.contratos_renting;
CREATE TRIGGER trg_contratos_renting_versao_imutavel
BEFORE UPDATE ON public.contratos_renting
FOR EACH ROW EXECUTE FUNCTION public.fn_contratos_renting_versao_imutavel();

-- ────────────────────────────────────────────────────────────
-- 4) RPC: criar_versao_contrato_renting
-- ────────────────────────────────────────────────────────────
-- Copia o contrato (e relações m:n) para uma nova linha versao+1,
-- marca a anterior como substituída, devolve o id da nova versão.
--
-- Não pode ser executado se:
--   - contrato já está substituído (substituido_em IS NOT NULL)
--   - contrato está soft-deleted
--   - contrato está facturado (proteger SAF-T — anular factura primeiro)

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
  -- Carrega versão actual (FOR UPDATE para serializar)
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

  -- Multi-tenant guard: chamador tem de ser da mesma org
  IF v_old.org_id <> get_current_org_id() THEN
    RAISE EXCEPTION 'Sem permissão sobre este contrato.';
  END IF;

  -- 1) Cria a nova linha (clone, sem snapshots de total nem facturado_em)
  INSERT INTO public.contratos_renting (
    org_id, reserva_id, transferista_id, cliente_id, viatura_id, matricula, grupo,
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

  -- 2) Marca a antiga como substituída
  UPDATE public.contratos_renting
     SET substituido_em = now(),
         updated_by     = v_user_id
   WHERE id = v_old.id;

  -- 3) Copia condutores
  INSERT INTO public.contrato_condutores (
    org_id, contrato_id, cliente_id, motorista_id, is_principal
  )
  SELECT org_id, v_new_id, cliente_id, motorista_id, is_principal
    FROM public.contrato_condutores
   WHERE contrato_id = v_old.id;

  -- 4) Copia coberturas (com snapshot)
  INSERT INTO public.contrato_coberturas (
    org_id, contrato_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
  )
  SELECT org_id, v_new_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
    FROM public.contrato_coberturas
   WHERE contrato_id = v_old.id;

  -- 5) Copia extras (com snapshot)
  INSERT INTO public.contrato_extras (
    org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
  )
  SELECT org_id, v_new_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
    FROM public.contrato_extras
   WHERE contrato_id = v_old.id;

  -- 6) Copia taxas (com snapshot)
  INSERT INTO public.contrato_taxas (
    org_id, contrato_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado
  )
  SELECT org_id, v_new_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado
    FROM public.contrato_taxas
   WHERE contrato_id = v_old.id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.criar_versao_contrato_renting(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.criar_versao_contrato_renting(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.criar_versao_contrato_renting(uuid, text) IS
  'Cria uma nova versão de um contrato_renting copiando a linha actual + relações '
  '(condutores, coberturas, extras, taxas) e marcando a anterior como substituida. '
  'Bloqueia contratos facturados (proteger SAF-T) e contratos já substituídos.';
