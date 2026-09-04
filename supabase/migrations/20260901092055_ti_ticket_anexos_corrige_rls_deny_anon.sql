-- rls_deny_anon tinha ficado "TO public" (bloqueava TODA a gente, incluindo
-- admins autenticados), em vez de "TO anon" como no resto do dominio
-- (ti_tickets). Corrige para o padrao certo.
DROP POLICY rls_deny_anon ON public.ti_ticket_anexos;

CREATE POLICY rls_deny_anon ON public.ti_ticket_anexos
  AS RESTRICTIVE FOR ALL TO anon
  USING (false);
