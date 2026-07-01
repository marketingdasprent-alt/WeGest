-- ============================================================
-- Código de motorista sequencial POR ORGANIZAÇÃO
-- ============================================================
-- Bug: motoristas_ativos.codigo usava uma sequência GLOBAL
-- (motoristas_codigo_seq, criada em 20260123124353) partilhada por
-- todas as orgs. Uma org nova continuava a numeração de outra org
-- (ex.: começava no 575) em vez de 1. O índice único era global
-- (idx_motoristas_ativos_codigo) em vez de por org.
--
-- Correção:
--   1. Largar o DEFAULT nextval() e o índice único global.
--   2. Índice único COMPOSTO (org_id, codigo) — códigos repetem
--      entre orgs mas são únicos dentro de cada org.
--   3. Trigger BEFORE INSERT que atribui codigo = MAX(codigo)+1
--      dentro da org (NULL -> 1). Serializado por org com
--      pg_advisory_xact_lock para evitar corrida em inserts
--      concorrentes.
--
-- Backfill: NENHUM. Não re-numeramos motoristas existentes.
--   - Orgs existentes (ex.: a principal) mantêm os códigos atuais;
--     o próximo motorista continua a partir do MAX dessa org.
--   - Orgs novas (sem motoristas) têm MAX = NULL -> começam em 1.
--   Decisão: "só orgs novas" — zero risco de partir referências
--   já impressas em contratos/recibos/etc.
--
-- Idempotente: pode correr-se mais que uma vez sem efeito colateral.
-- Deploy: aplicar à mão no SQL editor (CI não faz db push).
-- ============================================================

-- 1. Remover o default de sequência global (se ainda existir).
ALTER TABLE public.motoristas_ativos
  ALTER COLUMN codigo DROP DEFAULT;

-- 2. Remover o índice único GLOBAL e garantir o índice único COMPOSTO.
DROP INDEX IF EXISTS public.idx_motoristas_ativos_codigo;

CREATE UNIQUE INDEX IF NOT EXISTS idx_motoristas_ativos_org_codigo
  ON public.motoristas_ativos (org_id, codigo);

-- 3. Função + trigger: codigo sequencial por org.
CREATE OR REPLACE FUNCTION public.set_motorista_codigo_por_org()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- org_id já vem preenchido: o DEFAULT get_current_org_id() das
  -- colunas é aplicado ANTES dos triggers BEFORE. Mesmo assim,
  -- exigimos org_id para nunca cair num código "global".
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'motoristas_ativos.org_id é obrigatório para gerar código por org';
  END IF;

  -- Respeitar um código fornecido explicitamente (ex.: importações).
  IF NEW.codigo IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Serializar a numeração POR ORG (não bloqueia outras orgs nem a
  -- tabela toda). Liberta no fim da transação.
  PERFORM pg_advisory_xact_lock(
    hashtext('motoristas_ativos_codigo:' || NEW.org_id::text)
  );

  SELECT COALESCE(MAX(codigo), 0) + 1
    INTO NEW.codigo
    FROM public.motoristas_ativos
   WHERE org_id = NEW.org_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_motorista_codigo_por_org ON public.motoristas_ativos;

CREATE TRIGGER trg_motorista_codigo_por_org
  BEFORE INSERT ON public.motoristas_ativos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_motorista_codigo_por_org();

-- A sequência global motoristas_codigo_seq fica órfã (sem default a
-- usá-la). Não a largamos para não partir migrations/objetos antigos
-- que lhe possam referir; é inofensiva.

-- ============================================================
-- VERIFICAÇÃO (correr manualmente após aplicar):
--
--   -- Próximo código de CADA org (orgs novas devem dar 1):
--   SELECT org_id, COALESCE(MAX(codigo),0)+1 AS proximo
--     FROM public.motoristas_ativos GROUP BY org_id;
--
--   -- O índice único composto existe e o global já não:
--   SELECT indexname FROM pg_indexes
--    WHERE tablename = 'motoristas_ativos' AND indexname LIKE '%codigo%';
--   -- Esperado: idx_motoristas_ativos_org_codigo (NÃO idx_motoristas_ativos_codigo)
--
--   -- Teste numa org nova: inserir 2 motoristas -> codigos 1 e 2.
-- ============================================================
