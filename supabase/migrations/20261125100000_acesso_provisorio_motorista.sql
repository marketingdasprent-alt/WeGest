-- Acesso provisório do motorista à app (PR 1: só base de dados).
--
-- O staff carrega em "Enviar acesso" na ficha (motoristas_ativos); uma Edge
-- Function (PR 2) cria/reutiliza a conta, define uma senha temporária de 72 h e
-- envia-a por email. Aqui fica só o estado: o recurso de permissão, o registo
-- das senhas provisórias e as funções que a UI, a Edge Function e o cron usam.
-- A troca obrigatória da senha é aplicada na UI; a BD limita-se a registá-la.

-- ── 1. Recurso de permissão ────────────────────────────────────────────────
-- Organizações novas herdam-no: ensure_base_cargos dá ao Administrador todos
-- os recursos existentes em `recursos`. Outros grupos configuram-se na UI.
INSERT INTO public.recursos (nome, descricao, categoria)
VALUES (
  'motoristas_acesso_app',
  'Enviar acesso à app aos motoristas',
  'Motoristas'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, tem_acesso, pode_editar, org_id)
SELECT c.id, r.id, true, true, c.org_id
  FROM public.cargos c
  JOIN public.recursos r ON r.nome = 'motoristas_acesso_app'
 WHERE btrim(lower(c.nome)) = 'administrador'
   AND NOT EXISTS (
     SELECT 1 FROM public.cargo_permissoes cp
      WHERE cp.cargo_id = c.id AND cp.recurso_id = r.id
   );

-- ── 2. Registo das senhas provisórias ──────────────────────────────────────
-- senha_digest_envio: SHA-256 do hash da senha em auth.users logo depois de
-- definir a temporária. Quem só tem a senha temporária não consegue marcá-la
-- como trocada: marcar_senha_provisoria_trocada exige que o hash tenha mudado.
CREATE TABLE IF NOT EXISTS public.motorista_acessos_provisorios (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid        NOT NULL DEFAULT public.get_current_org_id()
                                 REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  motorista_id       uuid        NOT NULL
                                 REFERENCES public.motoristas_ativos(id) ON DELETE CASCADE,
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enviado_por        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  enviado_em         timestamptz NOT NULL DEFAULT now(),
  expira_em          timestamptz NOT NULL,
  trocada_em         timestamptz,
  expirada_em        timestamptz,
  substituida_em     timestamptz,
  deleted_at         timestamptz,
  senha_digest_envio text        NOT NULL
);

-- No máximo uma senha provisória viva por conta.
CREATE UNIQUE INDEX IF NOT EXISTS uq_motorista_acessos_prov_ativa
  ON public.motorista_acessos_provisorios (user_id)
  WHERE trocada_em IS NULL AND expirada_em IS NULL
    AND substituida_em IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_motorista_acessos_prov_motorista
  ON public.motorista_acessos_provisorios (motorista_id);

CREATE INDEX IF NOT EXISTS idx_motorista_acessos_prov_org
  ON public.motorista_acessos_provisorios (org_id);

CREATE INDEX IF NOT EXISTS idx_motorista_acessos_prov_user_recente
  ON public.motorista_acessos_provisorios (user_id, enviado_em DESC)
  WHERE deleted_at IS NULL;

-- Para o cron que roda as senhas expiradas.
CREATE INDEX IF NOT EXISTS idx_motorista_acessos_prov_expira
  ON public.motorista_acessos_provisorios (expira_em)
  WHERE trocada_em IS NULL AND expirada_em IS NULL
    AND substituida_em IS NULL AND deleted_at IS NULL;

ALTER TABLE public.motorista_acessos_provisorios ENABLE ROW LEVEL SECURITY;

-- O staff lê o estado só por motorista_estado_acesso (a UI não lê a tabela):
-- nenhum acesso directo para authenticated, para o digest nunca sair daqui.
-- A policy fica como rede de segurança se alguém der SELECT à tabela.
DROP POLICY IF EXISTS motorista_acessos_prov_select ON public.motorista_acessos_provisorios;
CREATE POLICY motorista_acessos_prov_select ON public.motorista_acessos_provisorios
  FOR SELECT TO authenticated
  USING (
    org_id = (SELECT public.get_current_org_id())
    AND public.has_permission((SELECT auth.uid()), 'motoristas_acesso_app')
  );

REVOKE ALL ON TABLE public.motorista_acessos_provisorios FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.motorista_acessos_provisorios TO service_role;

-- ── 3. Estado do acesso de um motorista ────────────────────────────────────
-- Ver o estado basta a permissão que o staff já tem para os motoristas
-- (motoristas_gestao); enviar exige motoristas_acesso_app. Fora da org ou sem
-- permissão não devolve linhas.
CREATE OR REPLACE FUNCTION public.motorista_estado_acesso(p_motorista_id uuid)
RETURNS TABLE (
  estado               text,
  email_conta          text,
  email_ficha          text,
  email_difere         boolean,
  ultimo_acesso        timestamptz,
  provisoria_expira_em timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_user_id      uuid;
  v_email_ficha  text;
  v_email_conta  text;
  v_ultimo       timestamptz;
  v_conta_existe boolean := false;
  v_ficha_existe boolean := false;
  v_enviado_em   timestamptz;
  v_expira_em    timestamptz;
  v_trocada_em   timestamptz;
  v_expirada_em  timestamptz;
  v_tem_linha    boolean := false;
  v_estado       text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT true, ma.user_id, ma.email
    INTO v_ficha_existe, v_user_id, v_email_ficha
    FROM public.motoristas_ativos ma
   WHERE ma.id = p_motorista_id
     AND ma.org_id = public.get_current_org_id();

  IF v_ficha_existe IS NOT TRUE THEN
    RETURN;
  END IF;

  IF NOT (
    public.has_permission(v_uid, 'motoristas_gestao')
    OR public.has_permission(v_uid, 'motoristas_acesso_app')
  ) THEN
    RETURN;
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT true, u.email::text, u.last_sign_in_at
      INTO v_conta_existe, v_email_conta, v_ultimo
      FROM auth.users u
     WHERE u.id = v_user_id;
  END IF;

  IF v_conta_existe IS NOT TRUE THEN
    RETURN QUERY SELECT 'sem_conta'::text, NULL::text, v_email_ficha,
                        false, NULL::timestamptz, NULL::timestamptz;
    RETURN;
  END IF;

  -- A linha mais recente que não foi apagada nem substituída por outra.
  SELECT true, p.enviado_em, p.expira_em, p.trocada_em, p.expirada_em
    INTO v_tem_linha, v_enviado_em, v_expira_em, v_trocada_em, v_expirada_em
    FROM public.motorista_acessos_provisorios p
   WHERE p.user_id = v_user_id
     AND p.deleted_at IS NULL
     AND p.substituida_em IS NULL
   ORDER BY p.enviado_em DESC
   LIMIT 1;

  IF v_tem_linha IS TRUE AND v_trocada_em IS NULL
     AND v_expirada_em IS NULL AND v_expira_em > now() THEN
    v_estado := 'provisoria_pendente';
  -- Expirada pelo cron: a senha foi rodada e já não entra, tenha ou não
  -- havido login antes; um login depois da rotação quer dizer que recuperou
  -- a senha sozinho. Se o cron ainda não correu, só conta quem nunca entrou
  -- depois do envio.
  ELSIF v_tem_linha IS TRUE AND v_trocada_em IS NULL
     AND ((v_expirada_em IS NOT NULL AND (v_ultimo IS NULL OR v_ultimo < v_expirada_em))
          OR (v_expirada_em IS NULL AND v_expira_em <= now()
              AND (v_ultimo IS NULL OR v_ultimo < v_enviado_em))) THEN
    v_estado := 'provisoria_expirada';
  ELSIF v_ultimo IS NULL THEN
    v_estado := 'nunca_entrou';
  ELSE
    v_estado := 'ativo';
  END IF;

  RETURN QUERY SELECT
    v_estado,
    v_email_conta,
    v_email_ficha,
    (lower(btrim(coalesce(v_email_conta, ''))) IS DISTINCT FROM
     lower(btrim(coalesce(v_email_ficha, '')))),
    v_ultimo,
    CASE WHEN v_estado IN ('provisoria_pendente', 'provisoria_expirada')
         THEN v_expira_em END;
END;
$$;

REVOKE ALL ON FUNCTION public.motorista_estado_acesso(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.motorista_estado_acesso(uuid) TO authenticated, service_role;

-- ── 4. O próprio utilizador: tem senha provisória por trocar? ──────────────
CREATE OR REPLACE FUNCTION public.minha_senha_provisoria()
RETURNS TABLE (por_trocar boolean, expira_em timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT true, p.expira_em
    FROM public.motorista_acessos_provisorios p
   WHERE p.user_id = auth.uid()
     AND p.trocada_em IS NULL
     AND p.expirada_em IS NULL
     AND p.substituida_em IS NULL
     AND p.deleted_at IS NULL
     AND p.expira_em > now()
   ORDER BY p.enviado_em DESC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.minha_senha_provisoria() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minha_senha_provisoria() TO authenticated, service_role;

-- ── 5. O próprio utilizador marca a senha como trocada ─────────────────────
-- Só marca se o hash em auth.users já não for o da senha enviada: quem apenas
-- tem a senha temporária não a consegue "trocar" sem a trocar mesmo.
-- Se o Auth recalcular o hash no login (mudança de custo do bcrypt), isto
-- deixaria passar sem troca; o custo é só perder a troca obrigatória.
-- Devolve true se marcou.
DROP FUNCTION IF EXISTS public.marcar_senha_provisoria_trocada();
CREATE FUNCTION public.marcar_senha_provisoria_trocada()
RETURNS boolean
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_digest_atual text;
  v_marcadas     int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT encode(extensions.digest(coalesce(u.encrypted_password, ''), 'sha256'), 'hex')
    INTO v_digest_atual
    FROM auth.users u
   WHERE u.id = auth.uid();

  IF v_digest_atual IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.motorista_acessos_provisorios p
     SET trocada_em = now()
   WHERE p.user_id = auth.uid()
     AND p.trocada_em IS NULL
     AND p.expirada_em IS NULL
     AND p.substituida_em IS NULL
     AND p.deleted_at IS NULL
     AND p.senha_digest_envio <> v_digest_atual;

  GET DIAGNOSTICS v_marcadas = ROW_COUNT;
  RETURN v_marcadas > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.marcar_senha_provisoria_trocada() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_senha_provisoria_trocada() TO authenticated, service_role;

-- ── 6. Funções só para a Edge Function e o cron (service_role) ─────────────
-- Chamada logo a seguir a updateUserById(password): substitui a senha viva
-- anterior e guarda o digest da nova. A org vem da ficha (o service_role não
-- tem organização corrente).
CREATE OR REPLACE FUNCTION public.registar_acesso_provisorio(
  p_motorista_id uuid,
  p_user_id      uuid,
  p_enviado_por  uuid,
  p_horas        int DEFAULT 72
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org_id  uuid;
  v_user_id uuid;
  v_digest  text;
  v_id      uuid;
BEGIN
  IF p_horas IS NULL OR p_horas <= 0 THEN
    RAISE EXCEPTION 'registar_acesso_provisorio: p_horas inválido';
  END IF;

  SELECT ma.org_id, ma.user_id INTO v_org_id, v_user_id
    FROM public.motoristas_ativos ma
   WHERE ma.id = p_motorista_id;

  IF v_org_id IS NULL OR v_user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'registar_acesso_provisorio: ficha inexistente ou ligada a outra conta';
  END IF;

  SELECT encode(extensions.digest(coalesce(u.encrypted_password, ''), 'sha256'), 'hex')
    INTO v_digest
    FROM auth.users u
   WHERE u.id = p_user_id;

  IF v_digest IS NULL THEN
    RAISE EXCEPTION 'registar_acesso_provisorio: conta inexistente';
  END IF;

  UPDATE public.motorista_acessos_provisorios p
     SET substituida_em = now()
   WHERE p.user_id = p_user_id
     AND p.trocada_em IS NULL
     AND p.expirada_em IS NULL
     AND p.substituida_em IS NULL
     AND p.deleted_at IS NULL;

  INSERT INTO public.motorista_acessos_provisorios
    (org_id, motorista_id, user_id, enviado_por, expira_em, senha_digest_envio)
  VALUES
    (v_org_id, p_motorista_id, p_user_id, p_enviado_por,
     now() + make_interval(hours => p_horas), v_digest)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registar_acesso_provisorio(uuid, uuid, uuid, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registar_acesso_provisorio(uuid, uuid, uuid, int) TO service_role;

-- Para o cron: reclama as senhas vivas que já passaram o prazo, antes de as
-- rodar. Primeiro as que o motorista já mudou por outra via (ex.: "esqueci a
-- senha"): o hash difere do enviado, ficam trocadas e o cron nunca lhes toca.
-- As restantes ficam expiradas e são devolvidas para rodar. SKIP LOCKED evita
-- que duas corridas sobrepostas reclamem a mesma linha.
CREATE OR REPLACE FUNCTION public.reclamar_acessos_provisorios_expirados()
RETURNS TABLE (id uuid, user_id uuid)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  UPDATE public.motorista_acessos_provisorios p
     SET trocada_em = now()
   WHERE p.id IN (
     SELECT q.id
       FROM public.motorista_acessos_provisorios q
       JOIN auth.users u ON u.id = q.user_id
      WHERE q.trocada_em IS NULL AND q.expirada_em IS NULL
        AND q.substituida_em IS NULL AND q.deleted_at IS NULL
        AND q.expira_em <= now()
        AND q.senha_digest_envio <>
            encode(extensions.digest(coalesce(u.encrypted_password, ''), 'sha256'), 'hex')
      FOR UPDATE OF q SKIP LOCKED
   );

  RETURN QUERY
  UPDATE public.motorista_acessos_provisorios p
     SET expirada_em = now()
   WHERE p.id IN (
     SELECT q.id
       FROM public.motorista_acessos_provisorios q
      WHERE q.trocada_em IS NULL AND q.expirada_em IS NULL
        AND q.substituida_em IS NULL AND q.deleted_at IS NULL
        AND q.expira_em <= now()
      FOR UPDATE OF q SKIP LOCKED
   )
  RETURNING p.id, p.user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reclamar_acessos_provisorios_expirados()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclamar_acessos_provisorios_expirados() TO service_role;

-- Desfaz a reclamação quando a rotação da senha falhou, para a próxima volta
-- tentar de novo. Não desfaz se entretanto nasceu outra senha viva (índice único).
CREATE OR REPLACE FUNCTION public.libertar_acesso_provisorio(p_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.motorista_acessos_provisorios p
     SET expirada_em = NULL
   WHERE p.id = p_id
     AND p.expirada_em IS NOT NULL
     AND p.trocada_em IS NULL
     AND p.substituida_em IS NULL
     AND p.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.motorista_acessos_provisorios o
        WHERE o.user_id = p.user_id AND o.id <> p.id
          AND o.trocada_em IS NULL AND o.expirada_em IS NULL
          AND o.substituida_em IS NULL AND o.deleted_at IS NULL
     );
$$;

REVOKE ALL ON FUNCTION public.libertar_acesso_provisorio(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.libertar_acesso_provisorio(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
