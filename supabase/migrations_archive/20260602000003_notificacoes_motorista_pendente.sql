-- ============================================================
-- Notificações de motorista pendente + escalonamento ao supervisor
-- ============================================================
-- Fluxo:
--  1. Candidatura passa a 'submetido' -> trigger cria notificação 'motorista_pendente'.
--  2. Popup aparece (real-time) para Gestor TVDE, Administrador e Supervisor Gestor TVDE.
--  3. Um Gestor/Admin "fecha" -> resolver_notificacao():
--       - marca resolvida (fecha para todos via real-time)
--       - cria notificação 'escalonamento' (urgente) para o Supervisor Gestor TVDE.
-- ============================================================

-- 1. Tabela de notificações ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizacoes(id),
  tipo text NOT NULL CHECK (tipo IN ('motorista_pendente', 'escalonamento')),
  candidatura_id uuid REFERENCES public.motorista_candidaturas(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  mensagem text,
  severidade text NOT NULL DEFAULT 'normal' CHECK (severidade IN ('normal', 'urgente')),
  resolvida boolean NOT NULL DEFAULT false,
  resolvida_por uuid REFERENCES auth.users(id),
  resolvida_por_nome text,
  resolvida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_tipo ON public.notificacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_notificacoes_resolvida ON public.notificacoes(resolvida);
CREATE INDEX IF NOT EXISTS idx_notificacoes_candidatura ON public.notificacoes(candidatura_id);

-- 2. Helper: cargo do utilizador atual (SECURITY DEFINER evita recursão de RLS)
CREATE OR REPLACE FUNCTION public.current_user_cargo()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cargo FROM public.profiles WHERE id = auth.uid();
$$;

-- 3. RLS --------------------------------------------------------------------
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;

-- Só SELECT para clientes. INSERT/UPDATE são feitos por funções SECURITY DEFINER.
-- org_id NULL = intake da empresa (candidatura sem org) -> visível a todos os gestores.
DROP POLICY IF EXISTS "ver notificacoes do meu cargo" ON public.notificacoes;
CREATE POLICY "ver notificacoes do meu cargo" ON public.notificacoes
  FOR SELECT
  USING (
    (org_id IS NULL OR org_id = get_current_org_id())
    AND (
      (
        tipo = 'motorista_pendente'
        AND (
          is_current_user_admin()
          OR current_user_cargo() IN ('Gestor TVDE', 'Administrador', 'Supervisor Gestor TVDE')
        )
      )
      OR (
        tipo = 'escalonamento'
        AND current_user_cargo() = 'Supervisor Gestor TVDE'
      )
    )
  );

-- 4. Trigger: nova candidatura pendente -> notificação ----------------------
CREATE OR REPLACE FUNCTION public.notificar_motorista_pendente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'submetido'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'submetido') THEN
    -- evita duplicar se já existe notificação ativa para esta candidatura
    IF NOT EXISTS (
      SELECT 1 FROM public.notificacoes
      WHERE candidatura_id = NEW.id
        AND tipo = 'motorista_pendente'
        AND resolvida = false
    ) THEN
      INSERT INTO public.notificacoes (org_id, tipo, candidatura_id, titulo, mensagem, severidade)
      VALUES (
        NEW.org_id,
        'motorista_pendente',
        NEW.id,
        'Novo motorista pendente',
        COALESCE(NEW.nome, 'Um motorista') || ' submeteu a candidatura e aguarda análise.',
        'normal'
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_motorista_pendente ON public.motorista_candidaturas;
CREATE TRIGGER trg_notificar_motorista_pendente
  AFTER INSERT OR UPDATE OF status ON public.motorista_candidaturas
  FOR EACH ROW
  EXECUTE FUNCTION public.notificar_motorista_pendente();

-- 5. RPC: resolver notificação (fecha p/ todos) + escalonamento -------------
CREATE OR REPLACE FUNCTION public.resolver_notificacao(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notif public.notificacoes;
  v_cargo text;
  v_nome text;
  v_is_admin boolean;
BEGIN
  SELECT * INTO v_notif FROM public.notificacoes WHERE id = p_id;
  IF NOT FOUND OR v_notif.resolvida THEN
    RETURN;
  END IF;

  v_cargo := current_user_cargo();
  v_is_admin := is_current_user_admin();
  SELECT nome INTO v_nome FROM public.profiles WHERE id = auth.uid();

  IF NOT (
    v_is_admin
    OR v_cargo IN ('Gestor TVDE', 'Administrador', 'Supervisor Gestor TVDE')
  ) THEN
    RAISE EXCEPTION 'Sem permissão para resolver notificações';
  END IF;

  UPDATE public.notificacoes
  SET resolvida = true,
      resolvida_por = auth.uid(),
      resolvida_por_nome = v_nome,
      resolvida_em = now()
  WHERE id = p_id;

  -- Escalonamento: só quando quem fechou foi Gestor TVDE ou Admin (não o próprio supervisor)
  IF v_notif.tipo = 'motorista_pendente'
     AND (v_is_admin OR v_cargo IN ('Gestor TVDE', 'Administrador')) THEN
    INSERT INTO public.notificacoes (org_id, tipo, candidatura_id, titulo, mensagem, severidade)
    VALUES (
      v_notif.org_id,
      'escalonamento',
      v_notif.candidatura_id,
      'Aviso fechado por um gestor',
      COALESCE(v_nome, 'Um gestor') || ' fechou o aviso de um motorista pendente. Verifique a candidatura.',
      'urgente'
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolver_notificacao(uuid) TO authenticated;

-- 6. Real-time --------------------------------------------------------------
ALTER TABLE public.notificacoes REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notificacoes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes;
  END IF;
END $$;
