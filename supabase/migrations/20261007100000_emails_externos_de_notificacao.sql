-- Emails da organização que recebem notificações, com os tipos escolhidos por email.
--
-- Até aqui um endereço de fora só entrava automação a automação ("Emails avulsos" no editor).
-- Passa a haver uma lista por organização (Definições > Notificações) e, por email, os tipos
-- de evento que recebe. Na execução, esses endereços juntam-se aos emails avulsos da regra de
-- email do mesmo evento: imediato ou no resumo diário, conforme a regra.
--
-- Aproveita-se para o seed: cinco regras nasciam com a lista de grupos vazia e, desde que a
-- cópia para os admins saiu (20260909120000), uma organização nova não avisava ninguém de
-- cobrança gerada, utilizador criado, contrato criado, renovação próxima e login suspeito.
-- Passam a nascer com o grupo Administrador, como as existentes foram corrigidas a 09/09.

-- ── 1. Tabelas ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notificacao_emails_externos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT public.get_current_org_id() REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nome text,
  ativo boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notificacao_emails_externos IS
  'Endereços da organização que recebem notificações por email, fora das contas de utilizador. Os tipos ficam em notificacao_emails_externos_tipos.';

CREATE UNIQUE INDEX IF NOT EXISTS notificacao_emails_externos_org_email_uniq
  ON public.notificacao_emails_externos (org_id, lower(email))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS notificacao_emails_externos_active
  ON public.notificacao_emails_externos (org_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_notificacao_emails_externos_updated_at ON public.notificacao_emails_externos;
CREATE TRIGGER trg_notificacao_emails_externos_updated_at
  BEFORE UPDATE ON public.notificacao_emails_externos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.notificacao_emails_externos_tipos (
  email_id uuid NOT NULL REFERENCES public.notificacao_emails_externos(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  org_id uuid NOT NULL DEFAULT public.get_current_org_id() REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email_id, event_type)
);

COMMENT ON TABLE public.notificacao_emails_externos_tipos IS
  'Tipos de evento (automation_rules.event_type) que cada email externo recebe.';

CREATE INDEX IF NOT EXISTS notificacao_emails_externos_tipos_evento
  ON public.notificacao_emails_externos_tipos (org_id, event_type);

-- ── 2. RLS: mesmo regime das regras de automação ────────────────────────────
ALTER TABLE public.notificacao_emails_externos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacao_emails_externos_tipos ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacao_emails_externos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notificacao_emails_externos_tipos TO authenticated;
REVOKE ALL ON public.notificacao_emails_externos FROM anon;
REVOKE ALL ON public.notificacao_emails_externos_tipos FROM anon;

DROP POLICY IF EXISTS rls_deny_anon ON public.notificacao_emails_externos;
CREATE POLICY rls_deny_anon ON public.notificacao_emails_externos
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS rls_org_isolation ON public.notificacao_emails_externos;
CREATE POLICY rls_org_isolation ON public.notificacao_emails_externos
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (org_id = public.get_current_org_id())
  WITH CHECK (org_id = public.get_current_org_id());
DROP POLICY IF EXISTS mt_notificacao_emails_externos_select ON public.notificacao_emails_externos;
CREATE POLICY mt_notificacao_emails_externos_select ON public.notificacao_emails_externos
  FOR SELECT TO authenticated
  USING (public.is_current_user_admin() OR public.has_permission(auth.uid(), 'automacoes'));
DROP POLICY IF EXISTS mt_notificacao_emails_externos_write ON public.notificacao_emails_externos;
CREATE POLICY mt_notificacao_emails_externos_write ON public.notificacao_emails_externos
  FOR ALL TO authenticated
  USING (public.is_current_user_admin() OR public.can_edit(auth.uid(), 'automacoes'))
  WITH CHECK (public.is_current_user_admin() OR public.can_edit(auth.uid(), 'automacoes'));

DROP POLICY IF EXISTS rls_deny_anon ON public.notificacao_emails_externos_tipos;
CREATE POLICY rls_deny_anon ON public.notificacao_emails_externos_tipos
  AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS rls_org_isolation ON public.notificacao_emails_externos_tipos;
CREATE POLICY rls_org_isolation ON public.notificacao_emails_externos_tipos
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (org_id = public.get_current_org_id())
  WITH CHECK (org_id = public.get_current_org_id());
DROP POLICY IF EXISTS mt_notificacao_emails_externos_tipos_select ON public.notificacao_emails_externos_tipos;
CREATE POLICY mt_notificacao_emails_externos_tipos_select ON public.notificacao_emails_externos_tipos
  FOR SELECT TO authenticated
  USING (public.is_current_user_admin() OR public.has_permission(auth.uid(), 'automacoes'));
DROP POLICY IF EXISTS mt_notificacao_emails_externos_tipos_write ON public.notificacao_emails_externos_tipos;
CREATE POLICY mt_notificacao_emails_externos_tipos_write ON public.notificacao_emails_externos_tipos
  FOR ALL TO authenticated
  USING (public.is_current_user_admin() OR public.can_edit(auth.uid(), 'automacoes'))
  WITH CHECK (public.is_current_user_admin() OR public.can_edit(auth.uid(), 'automacoes'));

-- ── 3. Quem subscreveu um evento ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.emails_externos_subscritos(p_org_id uuid, p_event_type text)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT COALESCE(array_agg(DISTINCT lower(btrim(e.email)) ORDER BY lower(btrim(e.email))), '{}'::text[])
    FROM public.notificacao_emails_externos e
    JOIN public.notificacao_emails_externos_tipos t ON t.email_id = e.id
   WHERE e.org_id = p_org_id
     AND e.ativo
     AND e.deleted_at IS NULL
     AND t.event_type = p_event_type;
$function$;

REVOKE EXECUTE ON FUNCTION public.emails_externos_subscritos(uuid, text) FROM PUBLIC, anon, authenticated;

-- ── 4. Remendos sobre as definições vivas ───────────────────────────────────
-- Cada par é uma só linha, sem quebras: as funções foram aplicadas a partir de ficheiros
-- com fins de linha diferentes e uma procura com quebras falhava num dos lados.
-- Aborta se não encontrar o texto: nunca deixa uma função a meio.
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

-- 4a. A execução junta os subscritos aos emails avulsos da regra, e respeita o resumo diário.
SELECT pg_temp.remendar('public.processar_automation_run(public.automation_runs)'::regprocedure, ARRAY[
  $a$    select jsonb_array_elements_text(coalesce(v_rule.acao_config->'destinatarios_emails_livres', '[]'::jsonb))$a$,
  $b$    select x.e from (select jsonb_array_elements_text(coalesce(v_rule.acao_config->'destinatarios_emails_livres', '[]'::jsonb)) as e union select unnest(public.emails_externos_subscritos(v_run.org_id, v_rule.event_type))) x$b$,
  -- Com resumo diário, o externo fica só com a linha-mãe; o email sai às 9h com os outros.
  $a$      values (v_notification_id, v_run.org_id, 'email', v_email_externo, v_rule.acao_config->>'template_codigo', v_run.payload)$a$,
  $b$      select v_notification_id, v_run.org_id, 'email', v_email_externo, v_rule.acao_config->>'template_codigo', v_run.payload where not v_enviar_email_digest$b$
]);

-- 4b. O resumo diário passa a agrupar também por email externo.
SELECT pg_temp.remendar('public.enviar_digests_diarios()'::regprocedure, ARRAY[
  $a$      n.destinatario_user_id,$a$,
  $b$      n.destinatario_user_id, n.destinatario_email_externo,$b$,
  $a$      u.email,$a$,
  $b$      coalesce(u.email, n.destinatario_email_externo) as email,$b$,
  $a$    join auth.users u on u.id = n.destinatario_user_id$a$,
  $b$    left join auth.users u on u.id = n.destinatario_user_id$b$,
  $a$    group by n.org_id, n.destinatario_user_id, u.email$a$,
  $b$    group by n.org_id, n.destinatario_user_id, n.destinatario_email_externo, u.email$b$,
  $a$    insert into public.notifications (org_id, destinatario_user_id, template_codigo, titulo, mensagem, payload)$a$,
  $b$    insert into public.notifications (org_id, destinatario_user_id, destinatario_email_externo, template_codigo, titulo, mensagem, payload)$b$,
  $a$      v_grupo.destinatario_user_id,$a$,
  $b$      v_grupo.destinatario_user_id, v_grupo.destinatario_email_externo,$b$
]);

-- 4c. O seed deixa de criar regras sem destinatário.
SELECT pg_temp.remendar('public.seed_automacao_defaults(uuid)'::regprocedure, ARRAY[
  $a$  v_cargo_gestor_tvde jsonb;$a$,
  $b$  v_cargo_gestor_tvde jsonb; v_cargo_admin jsonb;$b$,
  $a$  where c.org_id = p_org_id and c.nome ilike 'gestor tvde';$a$,
  $b$  where c.org_id = p_org_id and c.nome ilike 'gestor tvde'; select coalesce(jsonb_agg(c.id), '[]'::jsonb) into v_cargo_admin from public.cargos c where c.org_id = p_org_id and lower(btrim(c.nome)) = 'administrador';$b$,
  -- login suspeito trazia a lista vazia; as outras quatro nem a chave tinham.
  $a$'destinatarios_cargo_ids', '[]'::jsonb$a$,
  $b$'destinatarios_cargo_ids', v_cargo_admin$b$,
  $a$'template_codigo', 'cobranca.gerada', 'destinatarios_estrategia', 'cargo',$a$,
  $b$'template_codigo', 'cobranca.gerada', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_admin,$b$,
  $a$'template_codigo', 'utilizador.criado', 'destinatarios_estrategia', 'cargo',$a$,
  $b$'template_codigo', 'utilizador.criado', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_admin,$b$,
  $a$'template_codigo', 'contrato_renting.renovacao_proxima', 'destinatarios_estrategia', 'cargo',$a$,
  $b$'template_codigo', 'contrato_renting.renovacao_proxima', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_admin,$b$,
  $a$'template_codigo', 'contrato_renting.criado', 'destinatarios_estrategia', 'cargo',$a$,
  $b$'template_codigo', 'contrato_renting.criado', 'destinatarios_estrategia', 'cargo', 'destinatarios_cargo_ids', v_cargo_admin,$b$
]);

-- 4d. "Contrato fechado com danos" procura o grupo Gestor de Assistência, que uma organização
-- nova não tem (nasce só com Administrador, Gestor TVDE e Supervisor): sem ele, cai no Administrador.
SELECT pg_temp.remendar('public.seed_automacao_danos_assistencia(uuid)'::regprocedure, ARRAY[
  $a$or c.nome ilike '%gestor de assistencia%');$a$,
  $b$or c.nome ilike '%gestor de assistencia%'); if v_cargo_assistencia = '[]'::jsonb then select coalesce(jsonb_agg(c.id), '[]'::jsonb) into v_cargo_assistencia from public.cargos c where c.org_id = p_org_id and lower(btrim(c.nome)) = 'administrador'; end if;$b$
]);

-- ── 5. Regras já existentes sem destinatário: o mesmo acerto de 09/09 ──────────
UPDATE public.automation_rules r
   SET acao_config = r.acao_config
       || jsonb_build_object(
            'destinatarios_modo', 'grupo',
            'destinatarios_estrategia', 'cargo',
            'destinatarios_cargo_ids', jsonb_build_array(c.id::text)
          )
  FROM public.cargos c
 WHERE c.org_id = r.org_id
   AND lower(btrim(c.nome)) = 'administrador'
   AND r.ativo
   AND r.acao_tipo IN ('notificacao', 'email')
   AND COALESCE(r.acao_config->>'destinatarios_estrategia', 'cargo') = 'cargo'
   AND jsonb_array_length(COALESCE(r.acao_config->'destinatarios_cargo_ids', '[]'::jsonb)) = 0
   AND jsonb_array_length(COALESCE(r.acao_config->'destinatarios_user_ids', '[]'::jsonb)) = 0
   AND jsonb_array_length(COALESCE(r.acao_config->'destinatarios_emails_livres', '[]'::jsonb)) = 0;

NOTIFY pgrst, 'reload schema';
