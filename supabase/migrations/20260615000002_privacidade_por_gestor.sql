-- ============================================================
-- Privacidade de contratos e reservas por gestor
-- ============================================================
-- Dá privacidade entre colaboradores: cada gestor vê apenas os seus
-- contratos/reservas; superiores (admin ou permissão 'renting_ver_todos')
-- veem tudo. Ativável por org (flag privacidade_por_gestor, off por omissão —
-- comportamento atual mantém-se até ser ligada).
--
-- O calendário NÃO é afectado (continua partilhado — coordenação operacional).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, DROP+CREATE POLICY,
-- INSERT ... ON CONFLICT DO NOTHING, backfill com guarda (gestor_id IS NULL).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Coluna de dono (gestor_id) em contratos_renting e reservas
--    DEFAULT auth.uid() — quem cria fica dono (igual ao created_by).
-- ------------------------------------------------------------
ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS gestor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid();
ALTER TABLE public.reservas
  ADD COLUMN IF NOT EXISTS gestor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid();

COMMENT ON COLUMN public.contratos_renting.gestor_id IS
  'Gestor responsável (profiles.id). Default = quem criou. Base da privacidade por gestor.';
COMMENT ON COLUMN public.reservas.gestor_id IS
  'Gestor responsável (profiles.id). Default = quem criou. Base da privacidade por gestor.';

-- Backfill dos legados: dono = quem criou.
UPDATE public.contratos_renting SET gestor_id = created_by WHERE gestor_id IS NULL;
UPDATE public.reservas          SET gestor_id = created_by WHERE gestor_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_contratos_renting_gestor
  ON public.contratos_renting (org_id, gestor_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reservas_gestor
  ON public.reservas (org_id, gestor_id) WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- 2. Flag por org
-- ------------------------------------------------------------
ALTER TABLE public.org_definicoes
  ADD COLUMN IF NOT EXISTS privacidade_por_gestor boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.org_definicoes.privacidade_por_gestor IS
  'Quando true, contratos/reservas só são visíveis ao gestor dono (+ superiores).';

-- ------------------------------------------------------------
-- 3. Permissão RBAC: renting_ver_todos (superior vê tudo)
--    Atribuição a cargos é feita na UI de permissões; admins já passam
--    por is_current_user_admin().
-- ------------------------------------------------------------
INSERT INTO public.recursos (nome, categoria, descricao)
VALUES ('renting_ver_todos', 'renting',
        'Ver todos os contratos e reservas (ignora a privacidade por gestor)')
ON CONFLICT (nome) DO NOTHING;

-- ------------------------------------------------------------
-- 4. Helper: a org actual tem privacidade por gestor ligada?
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_privacidade_por_gestor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT privacidade_por_gestor FROM public.org_definicoes
      WHERE org_id = public.get_current_org_id()),
    false
  );
$$;

-- ------------------------------------------------------------
-- 5. RLS — contratos_renting (acrescenta predicado de privacidade)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "contratos_renting_select" ON public.contratos_renting;
CREATE POLICY "contratos_renting_select" ON public.contratos_renting
FOR SELECT TO authenticated
USING (
  org_id = public.get_current_org_id()
  AND public.has_renting_contratos_access()
  AND (deleted_at IS NULL OR public.is_current_user_admin())
  AND (
    NOT public.org_privacidade_por_gestor()
    OR public.is_current_user_admin()
    OR public.has_permission(auth.uid(), 'renting_ver_todos')
    OR gestor_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "contratos_renting_update" ON public.contratos_renting;
CREATE POLICY "contratos_renting_update" ON public.contratos_renting
FOR UPDATE TO authenticated
USING (
  org_id = public.get_current_org_id()
  AND public.has_renting_contratos_access()
  AND (deleted_at IS NULL OR public.is_current_user_admin())
  AND (
    NOT public.org_privacidade_por_gestor()
    OR public.is_current_user_admin()
    OR public.has_permission(auth.uid(), 'renting_ver_todos')
    OR gestor_id = auth.uid()
  )
)
WITH CHECK (
  org_id = public.get_current_org_id()
  AND public.has_renting_contratos_access()
  AND (
    NOT public.org_privacidade_por_gestor()
    OR public.is_current_user_admin()
    OR public.has_permission(auth.uid(), 'renting_ver_todos')
    OR gestor_id = auth.uid()
  )
);

-- (INSERT e DELETE mantêm-se inalterados — INSERT usa o DEFAULT do dono;
--  DELETE continua só-admin.)

-- ------------------------------------------------------------
-- 6. RLS — reservas (acrescenta predicado de privacidade)
--    IMPORTANTE: as policies LEGADAS reservas_select/reservas_update são
--    permissivas e combinavam com OR → furavam a privacidade. Têm de ser
--    REMOVIDAS (não basta criar as mt_*). O predicado de soft-delete que elas
--    tinham (deleted_at IS NULL OR admin) é dobrado aqui para não se perder.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "reservas_select" ON public.reservas;
DROP POLICY IF EXISTS "reservas_update" ON public.reservas;

DROP POLICY IF EXISTS "mt_reservas_select" ON public.reservas;
CREATE POLICY "mt_reservas_select" ON public.reservas FOR SELECT TO authenticated
  USING (
    org_id = get_current_org_id()
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'renting_reservas'))
    AND (deleted_at IS NULL OR public.is_current_user_admin())
    AND (
      NOT public.org_privacidade_por_gestor()
      OR public.is_current_user_admin()
      OR public.has_permission(auth.uid(), 'renting_ver_todos')
      OR gestor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "mt_reservas_update" ON public.reservas;
CREATE POLICY "mt_reservas_update" ON public.reservas FOR UPDATE TO authenticated
  USING (
    org_id = get_current_org_id()
    AND (is_current_user_admin() OR has_permission(auth.uid(), 'renting_reservas'))
    AND (deleted_at IS NULL OR public.is_current_user_admin())
    AND (
      NOT public.org_privacidade_por_gestor()
      OR public.is_current_user_admin()
      OR public.has_permission(auth.uid(), 'renting_ver_todos')
      OR gestor_id = auth.uid()
    )
  );

-- (mt_reservas_insert e mt_reservas_delete mantêm-se inalterados.)

-- ------------------------------------------------------------
-- 7. Versionamento — clonar gestor_id para a nova versão
--    (senão a troca de viatura cria uma versão "sem dono").
-- ------------------------------------------------------------
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

  -- 1) Cria a nova linha (clone — inclui gestor_id para preservar o dono)
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
    created_by, gestor_id
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
    v_user_id, v_old.gestor_id
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
