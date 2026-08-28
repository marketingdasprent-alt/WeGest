-- ============================================================
-- Função helper: soft_delete_entity(table_name, record_id)
-- ============================================================
-- Marca um registo como apagado (deleted_at = NOW()) sem o
-- remover fisicamente. Funciona para qualquer tabela que tenha
-- a coluna `deleted_at` e `id` como primary key.
--
-- Segurança:
--   • SECURITY INVOKER (default) — RLS da tabela aplica-se.
--   • Whitelist de tabelas permitidas (validação contra SQL
--     injection via nome de tabela dinâmico).
--   • Só actualiza registos onde deleted_at IS NULL (idempotente
--     — chamar duas vezes não faz nada na segunda).
--
-- Uso (RPC via Supabase):
--   SELECT * FROM public.soft_delete_entity('motoristas', $1);
--
-- Retorna: número de linhas afectadas (0 = não encontrado ou já apagado).
-- ============================================================

CREATE OR REPLACE FUNCTION public.soft_delete_entity(table_name text, record_id uuid)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  rows_affected integer;
  allowed_tables text[] := ARRAY[
    -- Top 10 tabelas (migradas nesta série de migrations)
    'motoristas',
    'contratos',
    'reservas',
    'viaturas',
    'movimentos',
    'motorista_viaturas',
    'motorista_financeiro',
    'reserva_condutores',
    'contrato_condutores',
    'invoices',
    -- Tabelas que já tinham deleted_at antes desta série
    'clientes',
    'contratos_renting',
    'contratos_prestacao',
    'documentos'
  ];
BEGIN
  -- Validação contra SQL injection: só tabelas na whitelist
  IF NOT table_name = ANY(allowed_tables) THEN
    RAISE EXCEPTION 'Tabela "%" não permitida para soft delete. Whitelist: %', table_name, allowed_tables;
  END IF;

  -- UPDATE dinâmico — só marca deleted_at se ainda for NULL (idempotente)
  EXECUTE format(
    'UPDATE public.%I SET deleted_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
    table_name
  ) USING record_id;

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected;
END;
$$;

COMMENT ON FUNCTION public.soft_delete_entity(text, uuid) IS
  'Marca um registo como apagado (soft delete). RLS da tabela aplica-se (SECURITY INVOKER). '
  'Só funciona em tabelas com coluna deleted_at. Idempotente: não re-escreve deleted_at se já estiver preenchido. '
  'Retorna o número de linhas afectadas (0 = não encontrado ou já apagado).';
