-- ============================================================
-- Permissão: gerir marcas / modelos / versões de viaturas
-- ============================================================
-- Até aqui qualquer utilizador da org podia criar/editar/eliminar
-- entradas em viatura_marcas/modelos/versoes (as policies de escrita
-- só verificavam org_id). Passa a exigir o recurso novo
-- `viaturas_marcas_modelos`. A LEITURA (SELECT) continua aberta a
-- qualquer utilizador da org — o catálogo é consumido em dropdowns
-- (criar viatura, grupo, etc.) e a página é guardada por viaturas_ver
-- na rota. Admins têm a permissão implícita (has_permission devolve
-- true para admins da org).
-- ============================================================

-- 1. Registar o recurso no catálogo de permissões
INSERT INTO public.recursos (nome, descricao, categoria)
VALUES (
  'viaturas_marcas_modelos',
  'Criar, editar e eliminar marcas, modelos e versões de viaturas',
  'Viaturas'
)
ON CONFLICT (nome) DO NOTHING;

-- 2. Escrita (INSERT/UPDATE/DELETE) passa a exigir a permissão.
--    SELECT fica intacto (não é tocado aqui).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['viatura_marcas', 'viatura_modelos', 'viatura_versoes']
  LOOP
    -- INSERT
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'mt_' || t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated '
      || 'WITH CHECK (org_id = public.get_current_org_id() '
      || 'AND public.has_permission(auth.uid(), %L))',
      'mt_' || t || '_insert', t, 'viaturas_marcas_modelos'
    );

    -- UPDATE
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'mt_' || t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated '
      || 'USING (org_id = public.get_current_org_id() '
      || 'AND public.has_permission(auth.uid(), %L)) '
      || 'WITH CHECK (org_id = public.get_current_org_id() '
      || 'AND public.has_permission(auth.uid(), %L))',
      'mt_' || t || '_update', t, 'viaturas_marcas_modelos', 'viaturas_marcas_modelos'
    );

    -- DELETE
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'mt_' || t || '_delete', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated '
      || 'USING (org_id = public.get_current_org_id() '
      || 'AND public.has_permission(auth.uid(), %L))',
      'mt_' || t || '_delete', t, 'viaturas_marcas_modelos'
    );
  END LOOP;
END $$;
