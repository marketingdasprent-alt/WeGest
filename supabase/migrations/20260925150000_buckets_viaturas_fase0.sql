-- Buckets de viaturas, fase 0: fechar escrita anónima e apagar entre orgs.
--
-- Em produção, viatura-danos deixava qualquer pessoa, mesmo sem sessão,
-- carregar, listar e APAGAR fotos de danos (prova de danos) e
-- viatura-documentos deixava qualquer sessão, de qualquer org, carregar e
-- apagar. Os buckets continuam públicos para leitura por URL — torná-los
-- privados, com links assinados e isolamento por org, é a fase 1.
--
-- As políticas antigas só existem em produção (criadas no painel), daí os
-- DROP ... IF EXISTS.

-- ── viatura-danos ───────────────────────────────────────────
DROP POLICY IF EXISTS "allow-public-uploads 160s84m_0" ON storage.objects;
DROP POLICY IF EXISTS "allow-public-uploads 160s84m_1" ON storage.objects;
DROP POLICY IF EXISTS "allow-public-uploads 160s84m_2" ON storage.objects;

-- A entrega e o check-in carregam fotos com a sessão de quem os faz.
CREATE POLICY viatura_danos_select_autenticado ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'viatura-danos');

CREATE POLICY viatura_danos_insert_autenticado ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'viatura-danos');

-- Apagar: quem carregou (desfaz o upload de uma entrega falhada) ou um admin.
CREATE POLICY viatura_danos_delete_dono_ou_admin ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'viatura-danos'
    AND (owner_id = auth.uid()::text OR public.is_current_user_admin())
  );

-- ── viatura-documentos ──────────────────────────────────────
DROP POLICY IF EXISTS "Acesso público para leitura viatura-documentos" ON storage.objects;
DROP POLICY IF EXISTS "Utilizadores autenticados podem eliminar viatura-documentos" ON storage.objects;
DROP POLICY IF EXISTS "Utilizadores autenticados podem fazer upload viatura-documentos" ON storage.objects;
DROP POLICY IF EXISTS "Permissão para upload viatura-documentos" ON storage.objects;
DROP POLICY IF EXISTS "Permissão para delete viatura-documentos" ON storage.objects;
DROP POLICY IF EXISTS "Permissão para update viatura-documentos" ON storage.objects;
DROP POLICY IF EXISTS "Permissão para ver ficheiros viatura-documentos" ON storage.objects;

-- Ler: quem pode ler a linha que referencia o ficheiro (herda o RLS de
-- viatura_documentos/viatura_dano_fotos, incluindo o motorista da viatura e o
-- isolamento por org), ou quem gere viaturas — que precisa de ler o ficheiro
-- acabado de carregar, antes de a linha existir.
CREATE POLICY viatura_documentos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'viatura-documentos'
    AND (
      EXISTS (SELECT 1 FROM public.viatura_documentos vd WHERE vd.ficheiro_url = storage.objects.name)
      OR EXISTS (SELECT 1 FROM public.viatura_dano_fotos f WHERE f.ficheiro_url = storage.objects.name)
      OR public.is_current_user_admin()
      OR public.has_permission(auth.uid(), 'viaturas_editar')
      OR public.has_permission(auth.uid(), 'motoristas_gestao')
    )
  );

-- Escrever e apagar: as mesmas permissões que a tabela viatura_documentos exige.
CREATE POLICY viatura_documentos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'viatura-documentos'
    AND (
      public.is_current_user_admin()
      OR public.has_permission(auth.uid(), 'viaturas_editar')
      OR public.has_permission(auth.uid(), 'motoristas_gestao')
    )
  );

CREATE POLICY viatura_documentos_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'viatura-documentos'
    AND (
      public.is_current_user_admin()
      OR public.has_permission(auth.uid(), 'viaturas_editar')
      OR public.has_permission(auth.uid(), 'motoristas_gestao')
    )
  )
  WITH CHECK (bucket_id = 'viatura-documentos');

CREATE POLICY viatura_documentos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'viatura-documentos'
    AND (
      public.is_current_user_admin()
      OR public.has_permission(auth.uid(), 'viaturas_editar')
      OR public.has_permission(auth.uid(), 'motoristas_gestao')
    )
  );
