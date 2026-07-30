-- Atualizar leads existentes que não têm licença TVDE
-- Buscar leads que responderam "Não" para licença TVDE e adicionar tag "Formação TVDE"
--
-- 2026-07-30 — envolvido num guarda de existência de coluna.
-- Este backfill referencia `leads_dasprent.formulario_id`, e nenhuma migração
-- anterior cria essa coluna: foi escrito contra a base de dados de produção, que
-- já a tinha. Consequência: `supabase db reset` falhava aqui com
-- `42703 column "formulario_id" does not exist`, e a cadeia de migrações não era
-- reproduzível de zero desde 2025-08-11. Detectado a 2026-07-30, quando o job
-- `rls-test` do CI se tornou a primeira coisa a reconstruir a base de dados.
--
-- O guarda é semanticamente inócuo: numa base de dados nova `leads_dasprent`
-- está vazia, logo o UPDATE afectaria zero linhas de qualquer forma. Onde a
-- coluna existe, o comportamento é exactamente o original.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads_dasprent'
      and column_name = 'formulario_id'
  ) then
    UPDATE leads_dasprent
    SET campaign_tags = CASE
      WHEN campaign_tags IS NULL THEN ARRAY['Formação TVDE']
      WHEN NOT ('Formação TVDE' = ANY(campaign_tags)) THEN array_append(campaign_tags, 'Formação TVDE')
      ELSE campaign_tags
    END,
    tem_formacao_tvde = false
    WHERE observacoes LIKE '%Não%'
      AND formulario_id = '3ca5675a-11a6-4e58-9d1f-2f9e53d4e5f0'
      AND (observacoes LIKE '%field_1748938811761%' OR observacoes LIKE '%licença%' OR observacoes LIKE '%licenca%');
  end if;
end $$;
