-- ============================================================
-- Anexos nos tickets de TI: quem submete pode anexar ficheiros
-- no momento do pedido.
-- ============================================================
-- Escrito sempre pela edge function ti-ticket-submeter, com a service role
-- (quem submete não tem sessão nenhuma) — por isso criado_por fica nulo
-- nesses casos e criado_por_nome guarda o nome escrito no formulário.
-- Leitura: quem gere tickets (mesmo padrão de RLS de ti_tickets).

CREATE TABLE public.ti_ticket_anexos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  ticket_id       uuid NOT NULL REFERENCES public.ti_tickets(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  ficheiro_url    text NOT NULL,
  tamanho_bytes   integer,
  mime_type       text,
  criado_por      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_por_nome text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX ti_ticket_anexos_ticket ON public.ti_ticket_anexos (ticket_id);

ALTER TABLE public.ti_ticket_anexos ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_deny_anon ON public.ti_ticket_anexos
  AS RESTRICTIVE FOR ALL TO public
  USING (false);

CREATE POLICY rls_org_isolation ON public.ti_ticket_anexos
  AS RESTRICTIVE FOR ALL TO public
  USING (org_id = get_current_org_id() OR is_decada_ousada_admin());

CREATE POLICY ti_ticket_anexos_gestao ON public.ti_ticket_anexos
  AS PERMISSIVE FOR ALL TO public
  USING (
    is_current_user_admin()
    OR has_permission(auth.uid(), 'ti_tickets_gerir')
    OR is_decada_ousada_admin()
  );

-- Bucket privado: só via URL assinada, mesmo padrão dos outros anexos.
INSERT INTO storage.buckets (id, name, public)
VALUES ('ti-ticket-anexos', 'ti-ticket-anexos', false);

-- Só leitura para quem gere tickets: nada aqui é escrito pelo browser, só
-- pela edge function (service role, que ignora RLS).
CREATE POLICY ti_ticket_anexos_storage_select ON storage.objects
  FOR SELECT TO public
  USING (
    bucket_id = 'ti-ticket-anexos'
    AND (
      is_current_user_admin()
      OR has_permission(auth.uid(), 'ti_tickets_gerir')
      OR is_decada_ousada_admin()
    )
  );
