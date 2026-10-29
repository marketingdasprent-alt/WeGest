-- Chat dos pedidos de informática: substitui as sugestões ("Resolveu / Não
-- resolveu") por uma conversa entre o suporte e quem pediu.
--
-- Só o servidor escreve (edge function ti-ticket-mensagem, service role): quem
-- pede pode não ter conta, e assim há um único caminho de escrita, com o nome e
-- o lado da conversa decididos no servidor. A app só lê, pela RLS.
--
-- Idempotente de propósito: volta a correr-se depois do deploy, para copiar as
-- sugestões que a app antiga ainda gravou entre a migração e a publicação.

CREATE TABLE IF NOT EXISTS public.ti_ticket_mensagens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  ticket_id       uuid NOT NULL REFERENCES public.ti_tickets(id) ON DELETE CASCADE,
  autor_tipo      text NOT NULL CHECK (autor_tipo IN ('suporte', 'autor')),
  criado_por      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_por_nome text NOT NULL,
  texto           text NOT NULL DEFAULT '' CHECK (char_length(texto) <= 2000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS ti_ticket_mensagens_ticket
  ON public.ti_ticket_mensagens (ticket_id, created_at)
  WHERE deleted_at IS NULL;

-- Anexos do chat vivem na mesma tabela dos anexos do pedido; nulo = anexado na
-- submissão.
ALTER TABLE public.ti_ticket_anexos
  ADD COLUMN IF NOT EXISTS mensagem_id uuid REFERENCES public.ti_ticket_mensagens(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ti_ticket_anexos_mensagem
  ON public.ti_ticket_anexos (mensagem_id)
  WHERE mensagem_id IS NOT NULL;

ALTER TABLE public.ti_ticket_mensagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_deny_anon ON public.ti_ticket_mensagens;
CREATE POLICY rls_deny_anon ON public.ti_ticket_mensagens
  AS RESTRICTIVE FOR ALL TO anon
  USING (false);

-- Igual às tabelas irmãs (ver 20260903093446): o Suporte TI da Década atende
-- todas as organizações.
DROP POLICY IF EXISTS rls_org_isolation ON public.ti_ticket_mensagens;
CREATE POLICY rls_org_isolation ON public.ti_ticket_mensagens
  AS RESTRICTIVE FOR ALL TO public
  USING (
    org_id = (SELECT public.get_current_org_id())
    OR (SELECT public.is_decada_ousada_admin())
    OR (SELECT public.is_suporte_ti_decada())
  );

DROP POLICY IF EXISTS ti_ticket_mensagens_gestao ON public.ti_ticket_mensagens;
CREATE POLICY ti_ticket_mensagens_gestao ON public.ti_ticket_mensagens
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.is_current_user_admin())
    OR (SELECT public.has_permission((SELECT auth.uid()), 'ti_tickets_gerir'))
    OR (SELECT public.is_decada_ousada_admin())
  );

DROP POLICY IF EXISTS ti_ticket_mensagens_leitura_proprio ON public.ti_ticket_mensagens;
CREATE POLICY ti_ticket_mensagens_leitura_proprio ON public.ti_ticket_mensagens
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    ticket_id IN (SELECT id FROM public.ti_tickets WHERE criado_por = (SELECT auth.uid()))
  );

-- Sem policies de escrita a RLS já recusa; tirar o privilégio fecha também o
-- caso de alguém acrescentar uma policy permissiva sem pensar nesta tabela.
REVOKE ALL ON public.ti_ticket_mensagens FROM anon, authenticated;
GRANT SELECT ON public.ti_ticket_mensagens TO authenticated;

-- Os anexos passam a ter o mesmo regime: só a service role escreve. A policy
-- antiga era FOR ALL e deixava quem gere apontar ficheiro_url para qualquer
-- caminho do bucket — incluindo pastas de pedidos de outra organização.
DROP POLICY IF EXISTS ti_ticket_anexos_gestao ON public.ti_ticket_anexos;
CREATE POLICY ti_ticket_anexos_gestao ON public.ti_ticket_anexos
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (SELECT public.is_current_user_admin())
    OR (SELECT public.has_permission((SELECT auth.uid()), 'ti_tickets_gerir'))
    OR (SELECT public.is_decada_ousada_admin())
  );
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ti_ticket_anexos FROM anon, authenticated;

-- Ler um ficheiro do bucket = ver a linha do anexo. Herda a RLS de
-- ti_ticket_anexos (isolamento por org + "o próprio"); as duas policies
-- anteriores só olhavam para a permissão na org activa e deixavam um admin de
-- qualquer organização assinar ficheiros de todas.
DROP POLICY IF EXISTS ti_ticket_anexos_storage_select ON storage.objects;
DROP POLICY IF EXISTS ti_ticket_anexos_storage_select_proprio ON storage.objects;
DROP POLICY IF EXISTS ti_ticket_anexos_storage_leitura ON storage.objects;
CREATE POLICY ti_ticket_anexos_storage_leitura ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'ti-ticket-anexos'
    AND name IN (SELECT ficheiro_url FROM public.ti_ticket_anexos)
  );

-- O histórico das sugestões passa a ser a primeira parte da conversa: a
-- sugestão é uma mensagem do suporte, a resposta é uma mensagem de quem pediu.
-- O NOT EXISTS deixa correr a migração várias vezes sem duplicar.
INSERT INTO public.ti_ticket_mensagens
  (org_id, ticket_id, autor_tipo, criado_por, criado_por_nome, texto, created_at)
SELECT t.org_id, s.ticket_id, 'suporte', s.criado_por,
       coalesce(nullif(trim(s.criado_por_nome), ''), 'Suporte'),
       left(s.texto, 2000), s.created_at
  FROM public.ti_ticket_sugestoes s
  JOIN public.ti_tickets t ON t.id = s.ticket_id
 WHERE NOT EXISTS (
   SELECT 1 FROM public.ti_ticket_mensagens m
    WHERE m.ticket_id = s.ticket_id AND m.autor_tipo = 'suporte' AND m.created_at = s.created_at
 );

-- Respostas sem data (não devia haver) ficam logo a seguir à sugestão.
INSERT INTO public.ti_ticket_mensagens
  (org_id, ticket_id, autor_tipo, criado_por, criado_por_nome, texto, created_at)
SELECT t.org_id, s.ticket_id, 'autor', t.criado_por, t.autor_nome,
       left(
         CASE WHEN s.util THEN 'Resolveu.'
              ELSE 'Não resolveu.' || coalesce(E'\n\n' || nullif(trim(s.resposta_texto), ''), '')
         END,
         2000
       ),
       coalesce(s.respondida_em, s.created_at + interval '1 second')
  FROM public.ti_ticket_sugestoes s
  JOIN public.ti_tickets t ON t.id = s.ticket_id
 WHERE s.util IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.ti_ticket_mensagens m
      WHERE m.ticket_id = s.ticket_id AND m.autor_tipo = 'autor'
        AND m.created_at = coalesce(s.respondida_em, s.created_at + interval '1 second')
   );

-- A conversa aberta no ecrã actualiza-se sozinha (useTiTicketsTempoReal).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
       AND tablename = 'ti_ticket_mensagens'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ti_ticket_mensagens;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
