-- Recuperada de supabase_migrations.schema_migrations (versão 20260714095652).
-- Foi aplicada em produção sem ficheiro correspondente no repositório.
UPDATE public.renting_tarifa_precos_modelo pm
   SET caucao_valor = pm.preco_semana, updated_at = now()
  FROM public.renting_tarifas t
 WHERE pm.tarifa_id = t.id
   AND t.nome = 'TVDE - Base'
   AND pm.preco_semana IS NOT NULL
   AND pm.caucao_valor IS DISTINCT FROM pm.preco_semana;
