-- ============================================================
-- Aviso de viatura disponível para a Lista de Espera
-- ============================================================
-- Quando uma viatura passa a 'disponivel', avisa (notificação persistente)
-- o gestor que criou uma lista de espera da mesma marca+modelo. O aviso é
-- dirigido a esse gestor (destinatario_id) e dispara uma vez por lista.
-- Reutiliza o sistema de notificações existente (tabela `notificacoes`).
-- Idempotente; multi-tenant por org_id.
-- ============================================================

-- 1. Lista de espera: marca/modelo separados + flag de já-notificada -------
ALTER TABLE public.calendario_eventos
  ADD COLUMN IF NOT EXISTS lista_marca text,
  ADD COLUMN IF NOT EXISTS lista_modelo text,
  ADD COLUMN IF NOT EXISTS lista_notificada_em timestamptz;

-- 2. Generalizar `notificacoes` -------------------------------------------
-- Novo tipo 'viatura_disponivel' + destino (1 utilizador) + viatura alvo.
ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_tipo_check
  CHECK (tipo IN ('motorista_pendente', 'escalonamento', 'viatura_disponivel'));

ALTER TABLE public.notificacoes
  ADD COLUMN IF NOT EXISTS destinatario_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS viatura_id uuid REFERENCES public.viaturas(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notificacoes_destinatario
  ON public.notificacoes(destinatario_id) WHERE destinatario_id IS NOT NULL;

-- 3. RLS: o destinatário vê o seu aviso (mantém os ramos por cargo) --------
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
      OR (
        tipo = 'viatura_disponivel'
        AND destinatario_id = auth.uid()
      )
    )
  );

-- 4. Trigger: viatura fica disponível -> avisa listas de espera compatíveis -
CREATE OR REPLACE FUNCTION public.notificar_lista_espera_viatura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF NEW.status = 'disponivel'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'disponivel') THEN
    FOR r IN
      SELECT e.id, e.criado_por, e.org_id
      FROM public.calendario_eventos e
      WHERE e.tipo = 'lista_espera'
        AND e.lista_notificada_em IS NULL
        AND e.criado_por IS NOT NULL
        AND (e.org_id IS NOT DISTINCT FROM NEW.org_id)
        AND (
          -- Match preferido: colunas separadas (fiável p/ modelos com espaço).
          (e.lista_marca IS NOT NULL AND e.lista_modelo IS NOT NULL
             AND lower(btrim(e.lista_marca)) = lower(btrim(NEW.marca))
             AND lower(btrim(e.lista_modelo)) = lower(btrim(NEW.modelo)))
          -- Fallback p/ listas antigas (só titulo "marca modelo").
          OR (e.lista_marca IS NULL
             AND lower(btrim(e.titulo)) = lower(btrim(NEW.marca || ' ' || NEW.modelo)))
        )
      FOR UPDATE OF e SKIP LOCKED
    LOOP
      INSERT INTO public.notificacoes
        (org_id, tipo, destinatario_id, viatura_id, titulo, mensagem, severidade)
      VALUES (
        r.org_id,
        'viatura_disponivel',
        r.criado_por,
        NEW.id,
        'Viatura disponível',
        btrim(COALESCE(NEW.marca, '') || ' ' || COALESCE(NEW.modelo, ''))
          || ' ficou disponível (matrícula ' || COALESCE(NEW.matricula, '—') || ').',
        'normal'
      );
      UPDATE public.calendario_eventos
        SET lista_notificada_em = now()
        WHERE id = r.id;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notificar_lista_espera_viatura ON public.viaturas;
CREATE TRIGGER trg_notificar_lista_espera_viatura
  AFTER UPDATE OF status ON public.viaturas
  FOR EACH ROW
  EXECUTE FUNCTION public.notificar_lista_espera_viatura();

-- 5. RPC resolver_notificacao: destinatário pode fechar o próprio aviso ----
-- (Reescreve a função; o ramo de escalonamento permanece só p/ motorista_pendente.)
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

  -- O destinatário do aviso pode sempre fechar o seu próprio aviso.
  -- Caso contrário, exige cargo de gestão (fluxo das candidaturas).
  IF v_notif.destinatario_id IS NOT NULL AND v_notif.destinatario_id = auth.uid() THEN
    NULL;
  ELSIF NOT (
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

  -- Escalonamento: só para motorista_pendente fechado por gestor/admin.
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
