-- Habilitar RLS em todas as tabelas que ainda não têm
ALTER TABLE IF EXISTS formulario_campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS empresa_dasprent ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS convites ENABLE ROW LEVEL SECURITY;

-- Verificar se existem outras tabelas sem RLS no schema public
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT schemaname, tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND NOT EXISTS (
            SELECT 1 FROM pg_class c 
            JOIN pg_namespace n ON n.oid = c.relnamespace 
            WHERE n.nspname = 'public' 
            AND c.relname = tablename 
            AND c.relrowsecurity = true
        )
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
        RAISE NOTICE 'Enabled RLS on table: %', r.tablename;
    END LOOP;
END $$;