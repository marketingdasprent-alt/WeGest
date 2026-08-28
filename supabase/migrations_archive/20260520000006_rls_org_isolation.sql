  -- ============================================================
  -- Isolamento multi-tenant — políticas RESTRICTIVE por org
  -- ============================================================
  -- PROBLEMA: as tabelas legadas têm políticas de SELECT/UPDATE/
  -- DELETE sem filtro de org_id (ex.: viaturas SELECT 'true',
  -- contratos SELECT 'is_current_user_admin() OR has_permission').
  -- Resultado: qualquer utilizador autenticado vê os dados de
  -- TODAS as organizações.
  --
  -- CORREÇÃO: a cada tabela com coluna org_id é adicionada uma
  -- política RESTRICTIVE. Políticas restritivas são AND'adas com
  -- todas as outras — independentemente do que as políticas
  -- permissivas digam, uma linha só é acessível se
  -- org_id = get_current_org_id(). É aditivo (não reescreve a
  -- lógica de permissões existente) e à prova de falhas: no pior
  -- caso o utilizador vê menos, nunca mais.
  --
  -- EXCLUÍDAS — tabelas com acesso público/cross-org legítimo:
  --   user_org_ativa     get_current_org_id() lê daqui + troca de org
  --   user_organizacoes  associações multi-org do utilizador
  --   convites           validação pública de tokens (pré-login)
  --   profiles           já é org-scoped; bootstrap de login
  --
  -- A política é FOR ALL: USING (leitura/edição/apagar só da
  -- própria org) e WITH CHECK (não permite criar/mover linhas
  -- para outra org; org_id NULL é aceite porque é preenchido por
  -- trigger). Aplica-se a 'authenticated' — fluxos anónimos
  -- (formulários públicos) não são afetados.
  -- ============================================================
  DO $$
  DECLARE
    t text;
    excluidas text[] := ARRAY[
      'user_org_ativa',
      'user_organizacoes',
      'convites',
      'profiles'
    ];
  BEGIN
    FOR t IN
      SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_schema = c.table_schema
      AND tb.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND c.column_name = 'org_id'
        AND tb.table_type = 'BASE TABLE'
        AND c.table_name <> ALL (excluidas)
      ORDER BY c.table_name
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'rls_org_isolation', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
        || 'USING (org_id = public.get_current_org_id()) '
        || 'WITH CHECK (org_id IS NULL OR org_id = public.get_current_org_id())',
        'rls_org_isolation', t
      );
      RAISE NOTICE 'isolamento org aplicado: %', t;
    END LOOP;
  END $$;
