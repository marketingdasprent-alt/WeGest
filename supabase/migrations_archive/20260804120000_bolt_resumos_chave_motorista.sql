-- ============================================================================
-- bolt_resumos_semanais: chave de upsert estável (chave_motorista)
-- ============================================================================
--
-- PROBLEMA
-- A chave de conflito era (integracao_id, periodo, identificador_motorista) e
-- ~465 linhas têm identificador_motorista NULL. Em Postgres dois NULLs são
-- distintos entre si, por isso essas linhas nunca entravam em conflito: cada
-- reimportação da mesma semana criava um duplicado novo, em silêncio.
--
-- SOLUÇÃO
-- Coluna chave_motorista = COALESCE(identificador_motorista, email, nome
-- normalizado), preenchida pela edge function bolt-import-csv, com índice único
-- (integracao_id, periodo, chave_motorista).
--
-- A constraint antiga UNIQUE(integracao_id, periodo, identificador_motorista)
-- NÃO é removida: quando identificador_motorista existe, chave_motorista é
-- igual a ele, portanto a chave nova é sempre pelo menos tão restritiva quanto
-- a antiga e as duas nunca se contradizem. Fica como rede de segurança.
--
-- Idempotente e aditiva: pode correr as vezes que forem precisas.
-- ============================================================================

-- ─── 1. Coluna ───────────────────────────────────────────────────────────────

ALTER TABLE public.bolt_resumos_semanais
  ADD COLUMN IF NOT EXISTS chave_motorista text;

COMMENT ON COLUMN public.bolt_resumos_semanais.chave_motorista IS
  'Chave estável de deduplicação: COALESCE(identificador_motorista, email, nome normalizado). '
  'Escrita pela edge function bolt-import-csv. Ver índice bolt_resumos_semanais_chave_unica.';

-- ─── 2. Normalização de nome (espelho do normalizeStr do TypeScript) ─────────
-- Minúsculas, sem acentos, sem pontuação, espaços colapsados. IMMUTABLE para
-- poder ser usada no backfill e, se um dia for preciso, em índices.

CREATE OR REPLACE FUNCTION public.bolt_normalizar_nome(p_nome text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        regexp_replace(
          lower(
            translate(
              coalesce(p_nome, ''),
              'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
              'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn'
            )
          ),
          '[^a-z0-9]+', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      )
    ),
    ''
  );
$$;

-- ─── 3. Backfill ─────────────────────────────────────────────────────────────
-- Só preenche o que ainda está a NULL, por isso é seguro repetir.

UPDATE public.bolt_resumos_semanais
SET chave_motorista = COALESCE(
      NULLIF(btrim(identificador_motorista), ''),
      NULLIF(lower(btrim(email)), ''),
      public.bolt_normalizar_nome(motorista_nome)
    )
WHERE chave_motorista IS NULL;

-- ─── 4. Duplicados históricos ────────────────────────────────────────────────
-- Sem os resolver, o índice único do passo 5 não pode ser criado.
--
-- ANTES DE CORRER, ver o que vai ser mexido:
--
--   SELECT integracao_id, periodo, chave_motorista, count(*)
--     FROM public.bolt_resumos_semanais
--    WHERE chave_motorista IS NOT NULL
--    GROUP BY 1, 2, 3
--   HAVING count(*) > 1
--    ORDER BY count(*) DESC;
--
-- Nada é apagado sem cópia: os duplicados vão primeiro para a tabela de backup
-- e só depois são removidos da tabela principal. Mantém-se a linha mais recente
-- de cada grupo (updated_at, depois created_at).

CREATE TABLE IF NOT EXISTS public.bolt_resumos_semanais_duplicados_20260804
  (LIKE public.bolt_resumos_semanais);

-- Sem políticas: só o service_role (que bypassa RLS) lhe toca.
ALTER TABLE public.bolt_resumos_semanais_duplicados_20260804 ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.bolt_resumos_semanais_duplicados_20260804 IS
  'Cópia das linhas duplicadas removidas de bolt_resumos_semanais em 2026-08-04, '
  'antes da criação do índice único (integracao_id, periodo, chave_motorista). '
  'Descartável depois de confirmados os totais do financeiro.';

WITH ordenados AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY integracao_id, periodo, chave_motorista
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
    ) AS pos
  FROM public.bolt_resumos_semanais
  WHERE chave_motorista IS NOT NULL
),
duplicados AS (
  SELECT id FROM ordenados WHERE pos > 1
),
copiados AS (
  INSERT INTO public.bolt_resumos_semanais_duplicados_20260804
  SELECT r.*
    FROM public.bolt_resumos_semanais r
    JOIN duplicados d ON d.id = r.id
  RETURNING id
)
DELETE FROM public.bolt_resumos_semanais r
USING copiados c
WHERE r.id = c.id;

-- ─── 5. Índice único (a chave nova) ──────────────────────────────────────────
-- É este índice que o ON CONFLICT (integracao_id, periodo, chave_motorista) da
-- edge function precisa de inferir. Enquanto não existir, a função cai para a
-- chave antiga e regista o aviso em bolt_sync_logs.

CREATE UNIQUE INDEX IF NOT EXISTS bolt_resumos_semanais_chave_unica
  ON public.bolt_resumos_semanais (integracao_id, periodo, chave_motorista);

-- ─── 6. Índice para o piso relativo ──────────────────────────────────────────
-- A função lê as ~8 semanas anteriores da mesma integração para calcular a
-- mediana de linhas e de bruto.

CREATE INDEX IF NOT EXISTS idx_bolt_resumos_integracao_inicio
  ON public.bolt_resumos_semanais (integracao_id, periodo_inicio DESC);
