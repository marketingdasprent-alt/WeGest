-- dashboard_resumo_plataformas ficou executável por anon.
--
-- Não foi um GRANT explícito: o Postgres concede EXECUTE a PUBLIC em todas as
-- funções novas, e a migração 20260903120000 criou-a sem revogar. Como é
-- SECURITY DEFINER, corre como o dono e ignora a RLS por completo — é
-- exactamente a superfície que o rls_anon_exposure.test.sql (teste 30) manda
-- fechar, e foi ele que a apanhou.
--
-- Na prática a função já se defendia sozinha (compara p_org_id com
-- get_current_org_id() e exige can_view_financeiro(), ambos falsos sem
-- sessão), mas isso é a segunda linha de defesa. A primeira é não estar ao
-- alcance de quem não tem sessão nenhuma.
--
-- Numa base já com a função aplicada isto corrige-a; numa base limpa corre a
-- seguir à criação e o efeito é o mesmo.

REVOKE ALL ON FUNCTION public.dashboard_resumo_plataformas(uuid, date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_resumo_plataformas(uuid, date, date)
  TO authenticated;
