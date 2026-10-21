-- Histórico de mudanças de estado das viaturas.
--
-- viaturas.status é escrito por ~20 sítios (ecrãs, triggers, Edge Functions, cron) e não havia
-- registo de quem mudou o quê. Toda a mudança passa a ficar gravada por trigger, no padrão de
-- motorista_historico / contrato_historico, e aparece na página de Auditoria.

-- ── Tabela ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.viatura_historico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Copiado da viatura, não de get_current_org_id(): um trigger disparado por cron não tem org activa.
  org_id uuid NOT NULL,
  viatura_id uuid NOT NULL REFERENCES public.viaturas(id) ON DELETE CASCADE,
  evento_tipo text NOT NULL CHECK (evento_tipo IN ('estado', 'inicial')),
  estado_anterior text,
  estado_novo text,
  ator_id uuid DEFAULT auth.uid(),
  -- 'PATCH /viaturas', 'POST /rpc/x', 'PATCH /contratos_renting' (cascata) quando vem do PostgREST;
  -- 'servidor' para cron e SQL Editor; 'migracao' para a semente.
  origem text,
  user_agent text,
  -- pg_trigger_depth(): 1 = escrita directa, >1 = veio de outro trigger; 0 = semente.
  profundidade smallint,
  detalhe text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.viatura_historico IS
  'Mudanças de estado de cada viatura, escritas só pelo trigger trg_viatura_regista_estado. Responde a "quem pôs este carro em manutenção e quando".';

CREATE INDEX IF NOT EXISTS idx_viatura_historico_viatura
  ON public.viatura_historico (viatura_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_viatura_historico_org
  ON public.viatura_historico (org_id, criado_em DESC);

-- ── RLS e grants ─────────────────────────────────────────────────────────────
-- Sem políticas de INSERT/UPDATE/DELETE para authenticated: só o trigger escreve.

ALTER TABLE public.viatura_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vh_select ON public.viatura_historico;
CREATE POLICY vh_select ON public.viatura_historico
  FOR SELECT TO authenticated
  USING (org_id = public.get_current_org_id());

-- RESTRICTIVE como nas outras tabelas com org_id (rls_org_isolation.test.sql exige-a).
DROP POLICY IF EXISTS rls_org_isolation ON public.viatura_historico;
CREATE POLICY rls_org_isolation ON public.viatura_historico
  AS RESTRICTIVE TO authenticated
  USING (org_id = public.get_current_org_id())
  WITH CHECK (org_id = public.get_current_org_id());

DROP POLICY IF EXISTS rls_deny_anon ON public.viatura_historico;
CREATE POLICY rls_deny_anon ON public.viatura_historico
  AS RESTRICTIVE TO anon
  USING (false) WITH CHECK (false);

-- Os default privileges dão mais do que SELECT; revogar primeiro e dar só o necessário.
REVOKE ALL ON TABLE public.viatura_historico FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.viatura_historico TO authenticated;

-- ── Trigger que regista a mudança ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_viatura_regista_estado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_origem text;
  v_user_agent text;
BEGIN
  -- Os GUCs request.* só existem em pedidos PostgREST; fora deles ficam NULL ou vazios.
  BEGIN
    v_origem := nullif(concat_ws(' ',
      nullif(current_setting('request.method', true), ''),
      nullif(current_setting('request.path', true), '')), '');
  EXCEPTION WHEN OTHERS THEN
    v_origem := NULL;
  END;

  -- request.headers pode não ser JSON válido; nunca pode fazer falhar o UPDATE da viatura.
  BEGIN
    v_user_agent := left(current_setting('request.headers', true)::jsonb ->> 'user-agent', 200);
  EXCEPTION WHEN OTHERS THEN
    v_user_agent := NULL;
  END;

  INSERT INTO public.viatura_historico
    (org_id, viatura_id, evento_tipo, estado_anterior, estado_novo, ator_id,
     origem, user_agent, profundidade, detalhe)
  VALUES
    (NEW.org_id, NEW.id, 'estado', OLD.status, NEW.status, auth.uid(),
     coalesce(v_origem, 'servidor'), v_user_agent, pg_trigger_depth(),
     format('status: %s → %s', coalesce(OLD.status, '—'), coalesce(NEW.status, '—')));

  RETURN NEW;
END;
$function$;

-- Default privileges dão EXECUTE a authenticated; revogar nomeando os três.
REVOKE EXECUTE ON FUNCTION public.fn_viatura_regista_estado() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_viatura_regista_estado ON public.viaturas;
CREATE TRIGGER trg_viatura_regista_estado
  AFTER UPDATE OF status ON public.viaturas
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.fn_viatura_regista_estado();

-- ── updated_at ───────────────────────────────────────────────────────────────
-- A coluna existe desde o início mas nenhum trigger a mantinha; reutiliza set_updated_at().

DROP TRIGGER IF EXISTS trg_viatura_status_updated_at ON public.viaturas;
CREATE TRIGGER trg_viatura_status_updated_at
  BEFORE UPDATE OF status ON public.viaturas
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.set_updated_at();

-- ── Semente: o estado de cada viatura à data da migração ─────────────────────

INSERT INTO public.viatura_historico
  (org_id, viatura_id, evento_tipo, estado_anterior, estado_novo, ator_id,
   origem, user_agent, profundidade, detalhe)
SELECT v.org_id, v.id, 'inicial', NULL, v.status, NULL,
       'migracao', NULL, 0, 'estado inicial registado pela migração'
  FROM public.viaturas v
 WHERE NOT EXISTS (
   SELECT 1 FROM public.viatura_historico h
    WHERE h.viatura_id = v.id AND h.evento_tipo = 'inicial'
 );

NOTIFY pgrst, 'reload schema';
