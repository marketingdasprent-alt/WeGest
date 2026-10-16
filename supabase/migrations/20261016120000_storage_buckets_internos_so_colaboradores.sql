-- Buckets internos só para colaboradores de uma organização.
--
-- Em produção, `documentos` (contratos assinados), `contrato-media` (fotos de
-- vistoria, até apagar), `documentos-suplementares`, `viatura-danos` e
-- `assistencia-anexos` têm políticas que dão acesso a QUALQUER utilizador com
-- sessão, sem organização nem permissão (criadas no painel, não estão no repo).
-- Com o registo público de motoristas e de clientes do site, qualquer pessoa
-- passa a ter uma sessão. Uma política RESTRICTIVE soma-se às existentes (todas
-- têm de passar): só entra quem é colaborador e tem uma organização activa.
--
-- Não isola uma organização de outra; isso fica para a fase seguinte, bucket a
-- bucket. Os fluxos por token (assinar, danos públicos) e as edge functions usam
-- service role e não são afectados. Medido a 16-10-2026: quem carregou ficheiros
-- nestes buckets é, sem excepção, colaborador com organização.

CREATE OR REPLACE FUNCTION public.e_colaborador_com_organizacao()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT public.get_current_org_id() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.tipo_utilizador = 'colaborador');
$function$;

COMMENT ON FUNCTION public.e_colaborador_com_organizacao() IS
  'Utilizador com sessão, perfil colaborador e organização activa. Usada pela política restritiva dos buckets internos.';

REVOKE EXECUTE ON FUNCTION public.e_colaborador_com_organizacao() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.e_colaborador_com_organizacao() TO authenticated;

DROP POLICY IF EXISTS buckets_internos_so_colaboradores ON storage.objects;
CREATE POLICY buckets_internos_so_colaboradores ON storage.objects
  AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    bucket_id NOT IN ('documentos', 'contrato-media', 'documentos-suplementares',
                      'viatura-danos', 'assistencia-anexos')
    OR public.e_colaborador_com_organizacao()
  )
  WITH CHECK (
    bucket_id NOT IN ('documentos', 'contrato-media', 'documentos-suplementares',
                      'viatura-danos', 'assistencia-anexos')
    OR public.e_colaborador_com_organizacao()
  );

-- Documentos do motorista: o motorista só aponta para ficheiros da sua pasta.
-- A política de leitura do bucket deixa o motorista ler qualquer caminho que
-- conste nas linhas dele em motorista_documentos, e ele pode inserir essas
-- linhas com o ficheiro_url que quiser: apontar para o ficheiro de outro
-- motorista dava-lhe a leitura. A equipa (admin ou motoristas_gestao) e as
-- funções do servidor não são limitadas.
CREATE OR REPLACE FUNCTION public.motorista_documentos_so_a_sua_pasta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF public.is_current_user_admin()
     OR public.has_permission(auth.uid(), 'motoristas_gestao') THEN
    RETURN NEW;
  END IF;
  IF split_part(NEW.ficheiro_url, '/', 1) = auth.uid()::text
     OR split_part(NEW.ficheiro_url, '/', 1) = NEW.motorista_id::text THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'O ficheiro tem de estar na pasta do próprio motorista'
    USING ERRCODE = '42501';
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.motorista_documentos_so_a_sua_pasta()
  FROM public, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_motorista_documentos_so_a_sua_pasta ON public.motorista_documentos;
CREATE TRIGGER trg_motorista_documentos_so_a_sua_pasta
  BEFORE INSERT OR UPDATE OF ficheiro_url, motorista_id ON public.motorista_documentos
  FOR EACH ROW EXECUTE FUNCTION public.motorista_documentos_so_a_sua_pasta();

NOTIFY pgrst, 'reload schema';
