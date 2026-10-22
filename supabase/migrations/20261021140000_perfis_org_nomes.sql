-- Nomes de colegas para listas ("criado por", "atribuído a") sem abrir profiles.
--
-- mt_profiles_select só deixa um não-admin ler colegas se tiver calendario_ver_gestores
-- ou admin_utilizadores. Gestor de Assistência e Mecânicos não têm nenhuma, e a lista de
-- tickets mostrava "Criado por: Desconhecido" em tudo menos nos próprios. Os dados estavam
-- certos; era só a leitura de profiles a vir vazia.

CREATE OR REPLACE FUNCTION public.perfis_org(p_ids uuid[])
RETURNS TABLE (id uuid, nome text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome
    FROM public.profiles p
   WHERE auth.uid() IS NOT NULL
     -- Tecto de 500 ids: evita que a RPC sirva para enumerar perfis em massa.
     AND coalesce(array_length(p_ids, 1), 0) BETWEEN 1 AND 500
     AND p.id = ANY (p_ids)
     -- Só membros da org activa de quem chama: nunca atravessa organizações.
     AND EXISTS (
       SELECT 1 FROM public.user_organizacoes uo
        WHERE uo.user_id = p.id AND uo.org_id = public.get_current_org_id()
     );
$$;

COMMENT ON FUNCTION public.perfis_org(uuid[]) IS
  'Nome de colegas da organização activa, para listas (criado por, atribuído a). Não expõe email nem cargo.';

-- Default privileges dão EXECUTE a PUBLIC/anon em cada função nova; revogar nomeando-os.
REVOKE EXECUTE ON FUNCTION public.perfis_org(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perfis_org(uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
