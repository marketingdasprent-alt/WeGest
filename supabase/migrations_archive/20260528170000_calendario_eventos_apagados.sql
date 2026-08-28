-- ============================================================
-- Auditoria de eventos de calendário apagados
-- ============================================================
-- Os eventos de calendário são apagados a sério (hard DELETE) —
-- manualmente, por cancelamento de contrato (cascata_estado) ou
-- ao versionar com viatura diferente (cascata_versao). Não havia
-- forma de ver um evento depois de apagado.
--
-- Esta tabela guarda um snapshot do evento ANTES de ser apagado,
-- via trigger BEFORE DELETE. Não muda o comportamento (o evento
-- continua a sair do calendário) — só fica um registo auditável.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.calendario_eventos_apagados (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id         uuid NOT NULL,           -- id original (sem FK — o evento já não existe)
  org_id            uuid,
  tipo              text,
  titulo            text,
  descricao         text,
  cidade            text,
  data_inicio       timestamptz,
  data_fim          timestamptz,
  matricula_devolver text,
  motorista_id      uuid,
  realizado_por_id  uuid,
  realizado_em      timestamptz,
  origem_tipo       text,
  origem_id         uuid,
  criado_por        uuid,
  apagado_por       uuid,
  apagado_em        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendario_apagados_org
  ON public.calendario_eventos_apagados (org_id, apagado_em DESC);
CREATE INDEX IF NOT EXISTS idx_calendario_apagados_origem
  ON public.calendario_eventos_apagados (origem_tipo, origem_id);

-- RLS — leitura scoped por org (tabela nova; rls_org_isolation não a apanha).
ALTER TABLE public.calendario_eventos_apagados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_calendario_apagados_select" ON public.calendario_eventos_apagados;
CREATE POLICY "mt_calendario_apagados_select" ON public.calendario_eventos_apagados
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());

-- ============================================================
-- Trigger: snapshot antes de apagar
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_log_evento_apagado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.calendario_eventos_apagados (
    evento_id, org_id, tipo, titulo, descricao, cidade,
    data_inicio, data_fim, matricula_devolver, motorista_id,
    realizado_por_id, realizado_em, origem_tipo, origem_id,
    criado_por, apagado_por
  )
  VALUES (
    OLD.id, OLD.org_id, OLD.tipo, OLD.titulo, OLD.descricao, OLD.cidade,
    OLD.data_inicio, OLD.data_fim, OLD.matricula_devolver, OLD.motorista_id,
    OLD.realizado_por_id, OLD.realizado_em, OLD.origem_tipo, OLD.origem_id,
    OLD.criado_por, auth.uid()
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_evento_apagado ON public.calendario_eventos;
CREATE TRIGGER trg_log_evento_apagado
  BEFORE DELETE ON public.calendario_eventos
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_evento_apagado();

COMMENT ON TABLE public.calendario_eventos_apagados IS
  'Snapshot de eventos de calendário antes de apagados (hard delete). '
  'Preenchido por trigger BEFORE DELETE. Apenas auditoria — não recupera o evento.';
