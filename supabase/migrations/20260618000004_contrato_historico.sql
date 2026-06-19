-- ============================================================
-- Histórico de Edições do Contrato (auditoria)
-- ============================================================
-- Tabela de eventos de auditoria por contrato, preenchida por TRIGGERS na BD
-- (auth.uid() + now()), à prova de bypass: regista mesmo alterações feitas por
-- SQL direto. Cobre os marcos do ciclo de vida e a "última alteração".
--
-- Eventos (evento_tipo):
--   reserva_criada     — a reserva de origem foi criada (ator = quem criou a reserva)
--   contrato_aberto    — contrato criado / passou a 'em_curso'
--   contrato_fechado   — contrato passou a 'devolvido' (viatura devolvida)
--   contrato_faturado  — estado_financeiro passou a 'facturado'
--   alteracao          — qualquer outra edição ao contrato (a "última alteração")
--
-- A secção da UI lê os 4 marcos + o evento de 'alteracao' mais recente.
-- ============================================================

-- 1) Tabela ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contrato_historico (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE
                DEFAULT public.get_current_org_id(),
  contrato_id   uuid NOT NULL REFERENCES public.contratos_renting(id) ON DELETE CASCADE,
  evento_tipo   text NOT NULL CHECK (evento_tipo IN (
                  'reserva_criada', 'contrato_aberto', 'contrato_fechado',
                  'contrato_faturado', 'alteracao'
                )),
  -- Ator: quem fez a ação. NULL só em casos legados / ações de sistema.
  ator_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  -- Detalhe opcional (ex.: "agendado → em_curso"); livre.
  detalhe       text,
  criado_em     timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_contrato_historico_contrato
  ON public.contrato_historico (contrato_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_contrato_historico_org
  ON public.contrato_historico (org_id);

COMMENT ON TABLE public.contrato_historico IS
  'Eventos de auditoria por contrato (criação, abertura, fecho, faturação, alterações). '
  'Preenchido por triggers — rastreabilidade total de quem fez cada operação.';

-- 2) RLS ------------------------------------------------------
-- Leitura: quem vê o contrato vê o histórico (mesma org). Escrita: só triggers
-- (SECURITY DEFINER nas funções), por isso não há policies de INSERT/UPDATE para
-- utilizadores — a tabela é append-only via triggers e imutável a partir da app.
ALTER TABLE public.contrato_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ch_select" ON public.contrato_historico;
CREATE POLICY "ch_select" ON public.contrato_historico
  FOR SELECT TO authenticated
  USING (org_id = public.get_current_org_id());

-- 3) Função de registo ---------------------------------------
-- SECURITY DEFINER para escrever na tabela apesar das policies restritivas.
CREATE OR REPLACE FUNCTION public.fn_contrato_historico_log(
  p_contrato_id uuid,
  p_org_id      uuid,
  p_evento      text,
  p_ator        uuid,
  p_detalhe     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe)
  VALUES (p_contrato_id, p_org_id, p_evento, p_ator, p_detalhe);
END;
$$;

-- 4) Trigger no INSERT do contrato → 'contrato_aberto' --------
-- Se já nasce 'em_curso' (walk-in entregue na hora) regista também o detalhe.
CREATE OR REPLACE FUNCTION public.fn_contrato_historico_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_contrato_historico_log(
    NEW.id, NEW.org_id, 'contrato_aberto',
    COALESCE(NEW.created_by, auth.uid()),
    'estado inicial: ' || NEW.estado_operacional
  );

  -- Se o contrato nasce já faturado (raro), regista o marco.
  IF NEW.estado_financeiro = 'facturado' THEN
    PERFORM public.fn_contrato_historico_log(
      NEW.id, NEW.org_id, 'contrato_faturado',
      COALESCE(NEW.created_by, auth.uid()), NULL
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrato_historico_insert ON public.contratos_renting;
CREATE TRIGGER trg_contrato_historico_insert
  AFTER INSERT ON public.contratos_renting
  FOR EACH ROW EXECUTE FUNCTION public.fn_contrato_historico_insert();

-- 5) Trigger no UPDATE do contrato ---------------------------
-- Distingue os marcos (fecho, faturação) das alterações genéricas. Cada save
-- que muda algo gera no mínimo um evento 'alteracao' (a "última alteração").
CREATE OR REPLACE FUNCTION public.fn_contrato_historico_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ator uuid := auth.uid();
  v_mudou boolean;
BEGIN
  -- "Algo mudou?" — compara só as colunas de negócio, IGNORANDO as de auditoria
  -- (updated_at/updated_by são sempre alteradas pelo trigger fn_audit_update, por
  -- isso NEW IS NOT DISTINCT FROM OLD nunca seria verdade). Se só mudaram colunas
  -- de auditoria, não há nada a registar.
  v_mudou := (
    NEW.reserva_id              IS DISTINCT FROM OLD.reserva_id
    OR NEW.cliente_id           IS DISTINCT FROM OLD.cliente_id
    OR NEW.viatura_id           IS DISTINCT FROM OLD.viatura_id
    OR NEW.matricula            IS DISTINCT FROM OLD.matricula
    OR NEW.grupo                IS DISTINCT FROM OLD.grupo
    OR NEW.estacao_entrega_id   IS DISTINCT FROM OLD.estacao_entrega_id
    OR NEW.estacao_recolha_id   IS DISTINCT FROM OLD.estacao_recolha_id
    OR NEW.estacao_origem_viatura_id IS DISTINCT FROM OLD.estacao_origem_viatura_id
    OR NEW.data_inicio          IS DISTINCT FROM OLD.data_inicio
    OR NEW.data_fim             IS DISTINCT FROM OLD.data_fim
    OR NEW.estado_operacional   IS DISTINCT FROM OLD.estado_operacional
    OR NEW.estado_financeiro    IS DISTINCT FROM OLD.estado_financeiro
    OR NEW.tarifa_diaria        IS DISTINCT FROM OLD.tarifa_diaria
    OR NEW.desconto_percentagem IS DISTINCT FROM OLD.desconto_percentagem
    OR NEW.taxa_iva             IS DISTINCT FROM OLD.taxa_iva
    OR NEW.valor_total_manual   IS DISTINCT FROM OLD.valor_total_manual
    OR NEW.total_subtotal       IS DISTINCT FROM OLD.total_subtotal
    OR NEW.total_iva            IS DISTINCT FROM OLD.total_iva
    OR NEW.total_final          IS DISTINCT FROM OLD.total_final
    OR NEW.voucher_codigo       IS DISTINCT FROM OLD.voucher_codigo
    OR NEW.numero_processo      IS DISTINCT FROM OLD.numero_processo
    OR NEW.voo_referencia       IS DISTINCT FROM OLD.voo_referencia
    OR NEW.local_entrega        IS DISTINCT FROM OLD.local_entrega
    OR NEW.local_recolha        IS DISTINCT FROM OLD.local_recolha
    OR NEW.comentarios_entrega  IS DISTINCT FROM OLD.comentarios_entrega
    OR NEW.comentarios_recolha  IS DISTINCT FROM OLD.comentarios_recolha
    OR NEW.observacoes          IS DISTINCT FROM OLD.observacoes
    OR NEW.deleted_at           IS DISTINCT FROM OLD.deleted_at
  );

  IF NOT v_mudou THEN
    RETURN NEW;  -- só mudaram colunas de auditoria → nada a registar
  END IF;

  -- Contrato fechado: passou a 'devolvido' ou 'cancelado' (estados terminais).
  IF NEW.estado_operacional IN ('devolvido', 'cancelado')
     AND OLD.estado_operacional NOT IN ('devolvido', 'cancelado') THEN
    PERFORM public.fn_contrato_historico_log(
      NEW.id, NEW.org_id, 'contrato_fechado', v_ator,
      OLD.estado_operacional || ' → ' || NEW.estado_operacional
    );
  END IF;

  -- Contrato faturado: estado_financeiro passou a 'facturado'.
  IF NEW.estado_financeiro = 'facturado'
     AND OLD.estado_financeiro IS DISTINCT FROM 'facturado' THEN
    PERFORM public.fn_contrato_historico_log(
      NEW.id, NEW.org_id, 'contrato_faturado', v_ator, NULL
    );
  END IF;

  -- "Contrato aberto" tardio: passou a 'em_curso' depois de agendado.
  IF NEW.estado_operacional = 'em_curso'
     AND OLD.estado_operacional IS DISTINCT FROM 'em_curso' THEN
    PERFORM public.fn_contrato_historico_log(
      NEW.id, NEW.org_id, 'contrato_aberto', v_ator,
      OLD.estado_operacional || ' → em_curso'
    );
  END IF;

  -- Qualquer alteração conta como "última alteração" — exceto quando a única
  -- diferença é o updated_at/updated_by (ruído do trigger de auditoria).
  PERFORM public.fn_contrato_historico_log(
    NEW.id, NEW.org_id, 'alteracao', v_ator, NULL
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrato_historico_update ON public.contratos_renting;
-- AFTER UPDATE, depois do trigger de auditoria (alfabético: 'audit' < 'historico'
-- não garante ordem entre AFTER; mas lemos auth.uid() diretamente, não de NEW).
CREATE TRIGGER trg_contrato_historico_update
  AFTER UPDATE ON public.contratos_renting
  FOR EACH ROW EXECUTE FUNCTION public.fn_contrato_historico_update();

-- 6) Reserva criada ------------------------------------------
-- Quando um contrato é ligado a uma reserva (reserva_id), registamos o marco
-- "reserva_criada" com o ATOR e a DATA da criação da reserva (não do contrato).
-- Feito no INSERT/UPDATE do contrato quando reserva_id está presente e ainda
-- não há evento 'reserva_criada' para esse contrato.
CREATE OR REPLACE FUNCTION public.fn_contrato_historico_reserva()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res record;
BEGIN
  IF NEW.reserva_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.contrato_historico
    WHERE contrato_id = NEW.id AND evento_tipo = 'reserva_criada'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT created_by, created_at INTO v_res
  FROM public.reservas WHERE id = NEW.reserva_id;

  IF FOUND THEN
    INSERT INTO public.contrato_historico
      (contrato_id, org_id, evento_tipo, ator_id, criado_em)
    VALUES
      (NEW.id, NEW.org_id, 'reserva_criada', v_res.created_by,
       COALESCE(v_res.created_at, timezone('utc', now())));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contrato_historico_reserva ON public.contratos_renting;
CREATE TRIGGER trg_contrato_historico_reserva
  AFTER INSERT OR UPDATE OF reserva_id ON public.contratos_renting
  FOR EACH ROW EXECUTE FUNCTION public.fn_contrato_historico_reserva();

-- 7) Backfill de contratos existentes -------------------------
-- Contratos criados antes desta migração não têm histórico. Reconstrói-se o que
-- a BD já sabe: abertura (created_by/created_at), faturação (updated_by/
-- facturado_em), reserva de origem (reserva.created_by/created_at) e uma
-- "alteração" a partir de updated_by/updated_at. Os triggers só atuam daqui em
-- diante. WHERE NOT EXISTS evita duplicar se a migração correr 2×.

-- Abertura (sempre que ainda não exista).
INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe, criado_em)
SELECT c.id, c.org_id, 'contrato_aberto', c.created_by,
       'estado inicial: ' || c.estado_operacional, c.created_at
FROM public.contratos_renting c
WHERE NOT EXISTS (
  SELECT 1 FROM public.contrato_historico h
  WHERE h.contrato_id = c.id AND h.evento_tipo = 'contrato_aberto'
);

-- Reserva de origem.
INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, criado_em)
SELECT c.id, c.org_id, 'reserva_criada', r.created_by,
       COALESCE(r.created_at, c.created_at)
FROM public.contratos_renting c
JOIN public.reservas r ON r.id = c.reserva_id
WHERE c.reserva_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.contrato_historico h
    WHERE h.contrato_id = c.id AND h.evento_tipo = 'reserva_criada'
  );

-- Faturação (contratos já facturados).
INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, criado_em)
SELECT c.id, c.org_id, 'contrato_faturado', c.updated_by, c.facturado_em
FROM public.contratos_renting c
WHERE c.estado_financeiro = 'facturado'
  AND c.facturado_em IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.contrato_historico h
    WHERE h.contrato_id = c.id AND h.evento_tipo = 'contrato_faturado'
  );

-- Fecho (contratos terminados).
INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe, criado_em)
SELECT c.id, c.org_id, 'contrato_fechado', c.updated_by,
       'estado: ' || c.estado_operacional, c.updated_at
FROM public.contratos_renting c
WHERE c.estado_operacional IN ('devolvido', 'cancelado')
  AND NOT EXISTS (
    SELECT 1 FROM public.contrato_historico h
    WHERE h.contrato_id = c.id AND h.evento_tipo = 'contrato_fechado'
  );

-- Última alteração conhecida (a partir do par updated_by/updated_at), só quando
-- difere da criação (senão a "última alteração" seria a própria abertura).
INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, criado_em)
SELECT c.id, c.org_id, 'alteracao', c.updated_by, c.updated_at
FROM public.contratos_renting c
WHERE c.updated_by IS NOT NULL
  AND c.updated_at IS DISTINCT FROM c.created_at
  AND NOT EXISTS (
    SELECT 1 FROM public.contrato_historico h
    WHERE h.contrato_id = c.id AND h.evento_tipo = 'alteracao'
  );
