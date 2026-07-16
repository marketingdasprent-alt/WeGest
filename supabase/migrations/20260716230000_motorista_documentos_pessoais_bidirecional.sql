-- ============================================================
-- Documentos pessoais do motorista — bidirecional (motorista <-> gestor)
-- ============================================================
-- No portal, "Os Meus Documentos" passa a listar os documentos pessoais
-- necessários (CC, carta, TVDE, registo criminal, comprovativos, outros) e o
-- motorista pode VER e ANEXAR — o que o gestor mete aparece-lhe, e o que ele
-- anexa aparece no backoffice.
--
-- Estado anterior: motorista_documentos era só staff, e o storage só deixava
-- o motorista ver os ficheiros da SUA pasta ({user_id}/…) — não os que o
-- gestor carregou (pasta do gestor). Faltavam:
--   1) políticas self-motorista em motorista_documentos (ver/inserir/atualizar
--      os SEUS). O motorista carrega sempre para motorista_documentos (não
--      mexe em motoristas_ativos — não tem, nem deve ter, escrita na ficha).
--   2) leitura no storage dos ficheiros REFERENCIADOS na sua ficha
--      (motoristas_ativos.*_url oficiais + motorista_documentos.ficheiro_url),
--      independentemente da pasta onde foram carregados.
-- (O upload do motorista para a sua própria pasta já era permitido.)
-- ============================================================

-- 1) motorista_documentos — self-motorista
DROP POLICY IF EXISTS "Motorista ve os seus documentos" ON public.motorista_documentos;
CREATE POLICY "Motorista ve os seus documentos"
  ON public.motorista_documentos FOR SELECT TO authenticated
  USING (
    motorista_id IN (SELECT id FROM public.motoristas_ativos WHERE user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Motorista adiciona os seus documentos" ON public.motorista_documentos;
CREATE POLICY "Motorista adiciona os seus documentos"
  ON public.motorista_documentos FOR INSERT TO authenticated
  WITH CHECK (
    motorista_id IN (SELECT id FROM public.motoristas_ativos WHERE user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Motorista atualiza os seus documentos" ON public.motorista_documentos;
CREATE POLICY "Motorista atualiza os seus documentos"
  ON public.motorista_documentos FOR UPDATE TO authenticated
  USING (
    motorista_id IN (SELECT id FROM public.motoristas_ativos WHERE user_id = (SELECT auth.uid()))
  )
  WITH CHECK (
    motorista_id IN (SELECT id FROM public.motoristas_ativos WHERE user_id = (SELECT auth.uid()))
  );

-- 2) storage: motorista lê os ficheiros dos SEUS documentos (mesmo os que o
--    gestor carregou noutra pasta), por referência na sua ficha.
DROP POLICY IF EXISTS "Motorista le ficheiros dos seus documentos pessoais" ON storage.objects;
CREATE POLICY "Motorista le ficheiros dos seus documentos pessoais"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'motorista-documentos'
    AND name IN (
      SELECT u FROM (
        SELECT unnest(ARRAY[
          ma.documento_ficheiro_url, ma.documento_identificacao_verso_url,
          ma.carta_ficheiro_url, ma.carta_conducao_verso_url,
          ma.licenca_tvde_ficheiro_url, ma.registo_criminal_url,
          ma.comprovativo_morada_url, ma.comprovativo_iban_url
        ]) AS u
        FROM public.motoristas_ativos ma
        WHERE ma.user_id = (SELECT auth.uid())
        UNION
        SELECT md.ficheiro_url AS u
        FROM public.motorista_documentos md
        JOIN public.motoristas_ativos ma ON ma.id = md.motorista_id
        WHERE ma.user_id = (SELECT auth.uid())
      ) refs
      WHERE u IS NOT NULL
    )
  );
