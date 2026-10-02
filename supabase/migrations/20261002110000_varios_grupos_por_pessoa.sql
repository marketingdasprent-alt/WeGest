-- Uma pessoa pode ter vários grupos (cargos) na mesma organização.
--
-- Antes: user_organizacoes tinha UNIQUE (user_id, org_id) e um só cargo_id, e
-- cada verificação de permissão lia esse único cargo.
--
-- Agora: cargo_id continua a ser o grupo PRINCIPAL (quem só tem um grupo não
-- nota nada, e o código que lê um cargo continua a funcionar). Os restantes
-- ficam em user_organizacoes_cargos, sem limite. As verificações passam a
-- considerar a soma de todos os grupos.
--
--   · permissões: has_permission, has_permission_edit, can_edit, is_suporte_ti
--   · administrador: is_admin fica verdadeiro se QUALQUER grupo tiver "admin"
--   · regras que olham para o nome do grupo (Gestor TVDE, Supervisor...)
--   · destinatários por grupo (automações, avisos, gestores, assistentes)

-- ── 1. Tabela dos grupos adicionais ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_organizacoes_cargos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL,
  cargo_id   uuid NOT NULL REFERENCES public.cargos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uoc_membro_fkey FOREIGN KEY (user_id, org_id)
    REFERENCES public.user_organizacoes (user_id, org_id) ON DELETE CASCADE,
  CONSTRAINT uoc_unico UNIQUE (user_id, org_id, cargo_id)
);

CREATE INDEX IF NOT EXISTS idx_uoc_cargo ON public.user_organizacoes_cargos (cargo_id);
CREATE INDEX IF NOT EXISTS idx_uoc_user_org ON public.user_organizacoes_cargos (user_id, org_id);

ALTER TABLE public.user_organizacoes_cargos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_deny_anon ON public.user_organizacoes_cargos;
CREATE POLICY rls_deny_anon ON public.user_organizacoes_cargos
  AS PERMISSIVE FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "Admins gerem os grupos da sua org" ON public.user_organizacoes_cargos;
CREATE POLICY "Admins gerem os grupos da sua org" ON public.user_organizacoes_cargos
  FOR ALL TO authenticated
  USING (org_id = get_current_org_id() AND is_current_user_admin())
  WITH CHECK (org_id = get_current_org_id() AND is_current_user_admin());

DROP POLICY IF EXISTS "Decada Ousada admins gerem os grupos" ON public.user_organizacoes_cargos;
CREATE POLICY "Decada Ousada admins gerem os grupos" ON public.user_organizacoes_cargos
  FOR ALL TO authenticated
  USING (is_decada_ousada_admin())
  WITH CHECK (is_decada_ousada_admin());

DROP POLICY IF EXISTS "Users veem os seus grupos" ON public.user_organizacoes_cargos;
CREATE POLICY "Users veem os seus grupos" ON public.user_organizacoes_cargos
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.user_organizacoes_cargos FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.user_organizacoes_cargos TO authenticated;
GRANT ALL ON public.user_organizacoes_cargos TO service_role;

COMMENT ON TABLE public.user_organizacoes_cargos IS
  'Grupos ADICIONAIS de uma pessoa numa organização. O principal continua em user_organizacoes.cargo_id. Ver 20261002110000.';

-- O grupo tem de ser da mesma organização; juntar o que já é o principal não
-- faz nada (idempotente, em vez de erro).
CREATE OR REPLACE FUNCTION public.tg_uoc_valida()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_org  uuid;
  v_prim uuid;
BEGIN
  SELECT c.org_id INTO v_org FROM public.cargos c WHERE c.id = NEW.cargo_id;
  IF v_org IS DISTINCT FROM NEW.org_id
     AND NEW.cargo_id <> 'a0000000-0000-0000-0000-000000000001' THEN
    RAISE EXCEPTION 'O grupo não pertence a esta organização.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT uo.cargo_id INTO v_prim
    FROM public.user_organizacoes uo
   WHERE uo.user_id = NEW.user_id AND uo.org_id = NEW.org_id;
  IF v_prim IS NOT DISTINCT FROM NEW.cargo_id THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_uoc_valida ON public.user_organizacoes_cargos;
CREATE TRIGGER trg_uoc_valida
  BEFORE INSERT OR UPDATE ON public.user_organizacoes_cargos
  FOR EACH ROW EXECUTE FUNCTION public.tg_uoc_valida();

-- Quando um grupo adicional passa a ser o principal, deixa de ser adicional.
CREATE OR REPLACE FUNCTION public.tg_uorg_normaliza_extras()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.user_organizacoes_cargos e
   WHERE e.user_id = NEW.user_id AND e.org_id = NEW.org_id AND e.cargo_id = NEW.cargo_id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_uorg_normaliza_extras ON public.user_organizacoes;
CREATE TRIGGER trg_uorg_normaliza_extras
  AFTER UPDATE OF cargo_id ON public.user_organizacoes
  FOR EACH ROW WHEN (NEW.cargo_id IS NOT NULL)
  EXECUTE FUNCTION public.tg_uorg_normaliza_extras();

-- ── 2. Funções de apoio ───────────────────────────────────────────────────
-- Todos os grupos de uma pessoa numa organização: o principal e os adicionais.
CREATE OR REPLACE FUNCTION public.cargo_ids_do_utilizador(p_user uuid, p_org uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(DISTINCT x.cargo_id), '{}'::uuid[])
    FROM (
      SELECT uo.cargo_id FROM public.user_organizacoes uo
       WHERE uo.user_id = p_user AND uo.org_id = p_org AND uo.cargo_id IS NOT NULL
      UNION ALL
      SELECT e.cargo_id FROM public.user_organizacoes_cargos e
       WHERE e.user_id = p_user AND e.org_id = p_org
    ) x;
$$;

-- A pessoa tem algum destes grupos (por nome)? Sem vínculo à organização, cai
-- no cargo guardado no perfil, como current_user_cargo() já fazia.
CREATE OR REPLACE FUNCTION public.utilizador_tem_cargo(p_user uuid, p_org uuid, p_nomes text[])
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.cargos c
            WHERE c.id = ANY (public.cargo_ids_do_utilizador(p_user, p_org))
              AND c.nome = ANY (p_nomes)
         )
      OR (
           NOT EXISTS (SELECT 1 FROM public.user_organizacoes uo
                        WHERE uo.user_id = p_user AND uo.org_id = p_org)
           AND EXISTS (SELECT 1 FROM public.profiles p
                        WHERE p.id = p_user AND p.cargo = ANY (p_nomes))
         );
$$;

-- Igual, para quem tem sessão aberta, na organização activa.
CREATE OR REPLACE FUNCTION public.current_user_tem_cargo(p_nomes text[])
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.utilizador_tem_cargo(auth.uid(), public.get_current_org_id(), p_nomes);
$$;

REVOKE ALL ON FUNCTION public.cargo_ids_do_utilizador(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.utilizador_tem_cargo(uuid, uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_user_tem_cargo(text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tg_uoc_valida() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_uorg_normaliza_extras() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cargo_ids_do_utilizador(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.utilizador_tem_cargo(uuid, uuid, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.current_user_tem_cargo(text[]) TO authenticated, service_role;

-- ── 3. Permissões: a soma de todos os grupos ──────────────────────────────
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _recurso text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cargos uuid[];
  _org_id uuid;
BEGIN
  _org_id := get_current_org_id();

  IF EXISTS (
    SELECT 1 FROM public.user_organizacoes
    WHERE user_id = _user_id AND org_id = _org_id AND is_admin = true
  ) THEN
    RETURN true;
  END IF;

  _cargos := public.cargo_ids_do_utilizador(_user_id, _org_id);
  IF COALESCE(array_length(_cargos, 1), 0) = 0 THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cargo_permissoes cp
    JOIN public.recursos r ON cp.recurso_id = r.id
    WHERE cp.cargo_id = ANY (_cargos)
      AND r.nome = _recurso
      AND cp.tem_acesso = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _recurso text, _acao text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cargos uuid[];
  _org_id uuid;
BEGIN
  _org_id := get_current_org_id();

  IF EXISTS (
    SELECT 1 FROM public.user_organizacoes
    WHERE user_id = _user_id AND org_id = _org_id AND is_admin = true
  ) THEN
    RETURN true;
  END IF;

  _cargos := public.cargo_ids_do_utilizador(_user_id, _org_id);
  IF COALESCE(array_length(_cargos, 1), 0) = 0 THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cargo_permissoes cp
    JOIN public.recursos r ON cp.recurso_id = r.id
    WHERE cp.cargo_id = ANY (_cargos)
      AND r.nome = _recurso
      AND (
        (_acao IN ('ver','criar','deletar') AND cp.tem_acesso = true) OR
        (_acao = 'editar' AND cp.tem_acesso = true AND cp.pode_editar = true)
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_permission_edit(_user_id uuid, _recurso text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cargos uuid[];
  _org_id uuid;
BEGIN
  _org_id := get_current_org_id();
  IF EXISTS (SELECT 1 FROM public.user_organizacoes WHERE user_id = _user_id AND org_id = _org_id AND is_admin = true) THEN
    RETURN true;
  END IF;
  _cargos := public.cargo_ids_do_utilizador(_user_id, _org_id);
  IF COALESCE(array_length(_cargos, 1), 0) = 0 THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.cargo_permissoes cp
    JOIN public.recursos r ON cp.recurso_id = r.id
    WHERE cp.cargo_id = ANY (_cargos) AND r.nome = _recurso AND cp.tem_acesso = true AND cp.pode_editar = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_edit(_user_id uuid, _recurso text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cargos uuid[];
  _org_id uuid;
BEGIN
  _org_id := get_current_org_id();

  IF EXISTS (
    SELECT 1 FROM public.user_organizacoes
    WHERE user_id = _user_id AND org_id = _org_id AND is_admin = true
  ) THEN
    RETURN true;
  END IF;

  _cargos := public.cargo_ids_do_utilizador(_user_id, _org_id);
  IF COALESCE(array_length(_cargos, 1), 0) = 0 THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.cargo_permissoes cp
    JOIN public.recursos r ON cp.recurso_id = r.id
    WHERE cp.cargo_id   = ANY (_cargos)
      AND r.nome        = _recurso
      AND cp.tem_acesso = true
      AND cp.pode_editar = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_suporte_ti_decada()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.cargo_permissoes cp
    JOIN public.recursos r ON r.id = cp.recurso_id
    WHERE cp.cargo_id = ANY (public.cargo_ids_do_utilizador(auth.uid(), '11111111-1111-1111-1111-111111111111'))
      AND r.nome = 'ti_tickets_gerir'
      AND cp.tem_acesso = true
  );
$$;

-- Ajudante das secções 4 a 6: troca texto numa função existente e para com erro
-- se a função mudou e o texto já não existe (a migração pára em vez de deixar
-- uma regra de segurança a meio).
CREATE OR REPLACE FUNCTION pg_temp.remendar(p_fn regprocedure, p_pares text[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  d text := pg_get_functiondef(p_fn);
  i int := 1;
BEGIN
  WHILE i < array_length(p_pares, 1) LOOP
    IF position(p_pares[i] IN d) = 0 THEN
      RAISE EXCEPTION 'A função % mudou: não encontro "%"', p_fn, p_pares[i];
    END IF;
    d := replace(d, p_pares[i], p_pares[i + 1]);
    i := i + 2;
  END LOOP;
  EXECUTE d;
END $$;

-- ── 4. Administrador: qualquer grupo com "admin" no nome ──────────────────
CREATE OR REPLACE FUNCTION public.sync_uorg_is_admin_from_cargo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cargo_nome text;
BEGIN
  IF NEW.cargo_id IS NOT NULL THEN
    SELECT nome INTO _cargo_nome FROM public.cargos WHERE id = NEW.cargo_id;
  END IF;
  NEW.is_admin := (COALESCE(_cargo_nome, '') ILIKE '%admin%')
    OR EXISTS (
      SELECT 1 FROM public.user_organizacoes_cargos e
      JOIN public.cargos c ON c.id = e.cargo_id
      WHERE e.user_id = NEW.user_id AND e.org_id = NEW.org_id AND c.nome ILIKE '%admin%'
    );
  RETURN NEW;
END;
$$;

-- Juntar um grupo de administrador torna admin; tirar o último desliga. Só toca
-- quando o grupo mexido é de administrador, para não desfazer um is_admin posto
-- à mão em quem não tem grupos de administrador.
CREATE OR REPLACE FUNCTION public.tg_uoc_sync_is_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r public.user_organizacoes_cargos;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  IF NOT EXISTS (SELECT 1 FROM public.cargos c WHERE c.id = r.cargo_id AND c.nome ILIKE '%admin%') THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'INSERT' THEN
    UPDATE public.user_organizacoes
       SET is_admin = true
     WHERE user_id = r.user_id AND org_id = r.org_id AND is_admin IS DISTINCT FROM true;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.cargos c
     WHERE c.nome ILIKE '%admin%'
       AND c.id = ANY (public.cargo_ids_do_utilizador(r.user_id, r.org_id))
  ) THEN
    UPDATE public.user_organizacoes
       SET is_admin = false
     WHERE user_id = r.user_id AND org_id = r.org_id AND is_admin IS DISTINCT FROM false;
  END IF;

  -- O perfil também guarda is_admin (lido por useAdmin): uma escrita sem
  -- mudanças faz o gatilho sync_is_admin_from_cargo recalculá-lo, já com os
  -- grupos adicionais (ver abaixo).
  UPDATE public.profiles SET is_admin = is_admin
   WHERE id = r.user_id AND org_id = r.org_id;
  RETURN NULL;
END $$;

-- O perfil deriva is_admin do grupo principal: passa a contar também os
-- adicionais da pessoa na organização do perfil.
SELECT pg_temp.remendar('public.sync_is_admin_from_cargo()'::regprocedure, ARRAY[
  $a$NEW.is_admin := (_cargo_nome ILIKE '%admin%');$a$,
  $b$NEW.is_admin := (_cargo_nome ILIKE '%admin%')
    OR EXISTS (
      SELECT 1 FROM public.user_organizacoes_cargos e
      JOIN public.cargos c ON c.id = e.cargo_id
      WHERE e.user_id = NEW.id AND e.org_id = NEW.org_id AND c.nome ILIKE '%admin%'
    );$b$
]);

DROP TRIGGER IF EXISTS trg_uoc_sync_is_admin ON public.user_organizacoes_cargos;
CREATE TRIGGER trg_uoc_sync_is_admin
  AFTER INSERT OR DELETE ON public.user_organizacoes_cargos
  FOR EACH ROW EXECUTE FUNCTION public.tg_uoc_sync_is_admin();

REVOKE ALL ON FUNCTION public.tg_uoc_sync_is_admin() FROM PUBLIC, anon, authenticated;

-- ── 5. Regras que olham para o nome do grupo ──────────────────────────────
SELECT pg_temp.remendar('public.marcar_todas_notificacoes_lidas()'::regprocedure, ARRAY[
  $a$v_cargo in ('Gestor TVDE', 'Administrador', 'Supervisor Gestor TVDE')$a$,
  $b$public.current_user_tem_cargo(array['Gestor TVDE', 'Administrador', 'Supervisor Gestor TVDE'])$b$,
  $a$v_cargo in ('Gestor TVDE', 'Administrador')$a$,
  $b$public.current_user_tem_cargo(array['Gestor TVDE', 'Administrador'])$b$
]);

SELECT pg_temp.remendar('public.resolver_notificacao(uuid)'::regprocedure, ARRAY[
  $a$v_cargo in ('Gestor TVDE', 'Administrador', 'Supervisor Gestor TVDE')$a$,
  $b$public.current_user_tem_cargo(array['Gestor TVDE', 'Administrador', 'Supervisor Gestor TVDE'])$b$,
  $a$v_cargo in ('Gestor TVDE', 'Administrador')$a$,
  $b$public.current_user_tem_cargo(array['Gestor TVDE', 'Administrador'])$b$
]);

SELECT pg_temp.remendar('public.responder_pedido_troca_kms(uuid, boolean, text)'::regprocedure, ARRAY[
  $a$public.current_user_cargo() = 'Supervisor Gestor TVDE'$a$,
  $b$public.current_user_tem_cargo(array['Supervisor Gestor TVDE'])$b$
]);

SELECT pg_temp.remendar('public.assign_lead_on_first_view(uuid, uuid)'::regprocedure, ARRAY[
  $a$user_cargo != 'Gestor TVDE'$a$,
  $b$NOT public.utilizador_tem_cargo(user_id_param, (SELECT ua.org_id FROM public.user_org_ativa ua WHERE ua.user_id = user_id_param), ARRAY['Gestor TVDE'])$b$
]);

ALTER POLICY "ver notificacoes do meu cargo" ON public.notificacoes USING (
  (org_id = get_current_org_id())
  AND (
    (
      (tipo = ANY (ARRAY['motorista_pendente'::text, 'motorista_documento_pendente'::text]))
      AND (is_current_user_admin()
           OR current_user_tem_cargo(ARRAY['Gestor TVDE'::text, 'Administrador'::text, 'Supervisor Gestor TVDE'::text]))
    )
    OR (
      (tipo = ANY (ARRAY['escalonamento'::text, 'pedido_troca_kms'::text]))
      AND (is_current_user_admin() OR current_user_tem_cargo(ARRAY['Supervisor Gestor TVDE'::text]))
    )
    OR (
      (tipo <> ALL (ARRAY['motorista_pendente'::text, 'motorista_documento_pendente'::text,
                          'escalonamento'::text, 'pedido_troca_kms'::text]))
      AND (destinatario_id = auth.uid())
    )
  )
);

-- ── 6. Destinatários por grupo ────────────────────────────────────────────
SELECT pg_temp.remendar('public.processar_automation_run(automation_runs)'::regprocedure, ARRAY[
  $a$or (v_modo <> 'individual' and uo.cargo_id = any(v_cargo_ids))$a$,
  $b$or (v_modo <> 'individual' and public.cargo_ids_do_utilizador(uo.user_id, uo.org_id) && v_cargo_ids)$b$
]);

CREATE OR REPLACE FUNCTION public.get_gestores_tvde()
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT p.id, p.nome
  FROM public.user_organizacoes uo
  JOIN public.profiles p ON p.id = uo.user_id
  WHERE uo.org_id = public.get_current_org_id()
    AND EXISTS (
      SELECT 1 FROM public.cargos c
      WHERE c.id = ANY (public.cargo_ids_do_utilizador(uo.user_id, uo.org_id))
        AND c.nome ILIKE '%gestor%'
        AND c.nome ILIKE '%tvde%'
    )
    AND p.nome IS NOT NULL
    AND btrim(p.nome) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.user_organizacoes membro
      WHERE membro.user_id = auth.uid()
        AND membro.org_id  = public.get_current_org_id()
    )
  ORDER BY p.nome;
$$;

CREATE OR REPLACE FUNCTION public.get_assistentes_disponiveis()
RETURNS TABLE(cargo_id uuid, cargo_nome text, user_id uuid, nome text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id AS cargo_id, c.nome AS cargo_nome, uo.user_id, p.nome
  FROM public.cargo_permissoes cp
  JOIN public.recursos r
    ON r.id = cp.recurso_id AND r.nome = 'assistencia_disponivel'
  JOIN public.cargos c
    ON c.id = cp.cargo_id
  JOIN public.user_organizacoes uo
    ON uo.org_id = cp.org_id
   AND c.id = ANY (public.cargo_ids_do_utilizador(uo.user_id, uo.org_id))
  JOIN public.profiles p
    ON p.id = uo.user_id
  WHERE cp.org_id = public.get_current_org_id()
    AND cp.tem_acesso = true
    AND (
      public.is_current_user_admin()
      OR public.has_permission(auth.uid(), 'assistencia_tickets')
      OR public.has_permission(auth.uid(), 'assistencia_criar')
      OR public.has_permission(auth.uid(), 'assistencia_ver')
    )
  ORDER BY c.nome, p.nome;
$$;

CREATE OR REPLACE FUNCTION public.avisar_staff_envio_motorista(p_org_id uuid, p_motorista_id uuid, p_template_codigo text, p_titulo text, p_mensagem text, p_link text, p_entity_table text, p_entity_id uuid, p_payload jsonb, p_janela interval DEFAULT '00:10:00'::interval)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r       record;
  v_notif uuid;
  v_n     integer := 0;
BEGIN
  IF p_org_id IS NULL THEN
    RETURN 0;
  END IF;

  IF p_janela IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.notifications
    WHERE org_id = p_org_id
      AND template_codigo = p_template_codigo
      AND link = p_link
      AND created_at > now() - p_janela
  ) THEN
    RETURN 0;
  END IF;

  FOR r IN
    SELECT DISTINCT p.id AS user_id, p.email
    FROM public.user_organizacoes uo
    JOIN public.profiles p ON p.id = uo.user_id
    WHERE uo.org_id = p_org_id
      AND p.email IS NOT NULL
      AND btrim(p.email) <> ''
      AND (
        COALESCE(uo.is_admin, false)
        OR EXISTS (
          SELECT 1 FROM public.cargos c
          WHERE c.id = ANY (public.cargo_ids_do_utilizador(uo.user_id, uo.org_id))
            AND lower(c.nome) IN (
              'administrador',
              'gestor tvde',
              'supervisor gestor tvde',
              'financeiro',
              'faturação',
              'faturacao'
            )
        )
      )
  LOOP
    INSERT INTO public.notifications
      (org_id, destinatario_user_id, template_codigo, severidade, titulo, mensagem,
       link, entity_table, entity_id, payload)
    VALUES
      (p_org_id, r.user_id, p_template_codigo, 'normal', p_titulo, p_mensagem,
       p_link, p_entity_table, p_entity_id, COALESCE(p_payload, '{}'::jsonb))
    RETURNING id INTO v_notif;

    INSERT INTO public.notification_queue
      (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
    VALUES
      (v_notif, p_org_id, 'email', r.email, p_template_codigo, COALESCE(p_payload, '{}'::jsonb));

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;

-- Quem pertence a estes grupos (principal ou adicionais) na organização activa.
-- Para ecrãs de quem não é admin, que não lê user_organizacoes_cargos: mesmo
-- critério de get_gestores_tvde (só responde a quem é membro da organização).
CREATE OR REPLACE FUNCTION public.get_utilizadores_dos_grupos(p_cargo_ids uuid[])
RETURNS TABLE(user_id uuid, cargo_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT uo.user_id, g.cargo_id
  FROM public.user_organizacoes uo
  CROSS JOIN LATERAL unnest(public.cargo_ids_do_utilizador(uo.user_id, uo.org_id)) AS g(cargo_id)
  WHERE uo.org_id = public.get_current_org_id()
    AND g.cargo_id = ANY (p_cargo_ids)
    AND EXISTS (
      SELECT 1 FROM public.user_organizacoes membro
      WHERE membro.user_id = auth.uid()
        AND membro.org_id  = public.get_current_org_id()
    );
$$;

REVOKE ALL ON FUNCTION public.get_utilizadores_dos_grupos(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_utilizadores_dos_grupos(uuid[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
