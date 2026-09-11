-- A view agrega dados multi-tenant de fontes operacionais. Como SECURITY
-- DEFINER, a consulta corria com o owner postgres e podia ignorar as RLS das
-- tabelas de origem. SECURITY INVOKER conserva a API e aplica os privilégios e
-- políticas do utilizador que consulta a view.
ALTER VIEW public.v_atraso_das_fontes SET (security_invoker = true);

REVOKE ALL ON TABLE public.v_atraso_das_fontes FROM PUBLIC;
REVOKE ALL ON TABLE public.v_atraso_das_fontes FROM anon;
GRANT SELECT ON TABLE public.v_atraso_das_fontes TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
