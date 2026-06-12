-- ============================================================
-- AUDITORIA READ-ONLY: NIFs e IBANs inválidos na base de dados
-- ============================================================
-- 100% SELECT — não altera nada. Correr no SQL editor do Supabase.
-- Mede o tamanho do problema ANTES de limpar dados antigos.
-- (A protecção de valores novos é feita por triggers — ver migration
--  20260611000002_nif_iban_validacao.sql — e não depende desta limpeza.)
--
-- Validação NIF: 9 dígitos, dígito de entidade ∈ {1,2,3,5,6,7,8,9},
--   checksum oficial AT (pesos 9→2, módulo 11).
-- Validação IBAN: formato ISO, PT tem 25 chars, checksum mod-97 = 1.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) NIFs inválidos (detalhe, por tabela)
-- ────────────────────────────────────────────────────────────
WITH nifs AS (
  SELECT 'motoristas_ativos' AS tabela, id::text AS id, nome, nif
    FROM public.motoristas_ativos
   WHERE nif IS NOT NULL AND btrim(nif) <> ''
  UNION ALL
  SELECT 'clientes', id::text, nome, nif
    FROM public.clientes
   WHERE nif IS NOT NULL AND btrim(nif) <> '' AND deleted_at IS NULL
  UNION ALL
  SELECT 'empresas', id, nome, nif
    FROM public.empresas
   WHERE nif IS NOT NULL AND btrim(nif) <> ''
  UNION ALL
  SELECT 'organizacoes', id::text, nome, nif
    FROM public.organizacoes
   WHERE nif IS NOT NULL AND btrim(nif) <> ''
),
norm AS (
  SELECT *, regexp_replace(nif, '\s', '', 'g') AS n FROM nifs
),
aval AS (
  SELECT *,
    CASE
      WHEN n !~ '^[0-9]{9}$' THEN 'formato (não tem 9 dígitos)'
      WHEN substr(n, 1, 1) NOT IN ('1','2','3','5','6','7','8','9') THEN 'dígito de entidade inválido'
      WHEN n IN ('999999990', '999999999') THEN 'NIF de teste (fictício)'
      WHEN (
        CASE WHEN (9*substr(n,1,1)::int + 8*substr(n,2,1)::int + 7*substr(n,3,1)::int
                 + 6*substr(n,4,1)::int + 5*substr(n,5,1)::int + 4*substr(n,6,1)::int
                 + 3*substr(n,7,1)::int + 2*substr(n,8,1)::int) % 11 < 2
             THEN 0
             ELSE 11 - ((9*substr(n,1,1)::int + 8*substr(n,2,1)::int + 7*substr(n,3,1)::int
                       + 6*substr(n,4,1)::int + 5*substr(n,5,1)::int + 4*substr(n,6,1)::int
                       + 3*substr(n,7,1)::int + 2*substr(n,8,1)::int) % 11)
        END
      ) <> substr(n, 9, 1)::int THEN 'checksum errado (dígito de controlo)'
      ELSE NULL
    END AS motivo
  FROM norm
)
SELECT tabela, id, nome, nif, motivo
  FROM aval
 WHERE motivo IS NOT NULL
 ORDER BY tabela, nome;

-- ────────────────────────────────────────────────────────────
-- 2) NIFs — resumo por tabela
-- ────────────────────────────────────────────────────────────
WITH nifs AS (
  SELECT 'motoristas_ativos' AS tabela, nif FROM public.motoristas_ativos
   WHERE nif IS NOT NULL AND btrim(nif) <> ''
  UNION ALL
  SELECT 'clientes', nif FROM public.clientes
   WHERE nif IS NOT NULL AND btrim(nif) <> '' AND deleted_at IS NULL
  UNION ALL
  SELECT 'empresas', nif FROM public.empresas
   WHERE nif IS NOT NULL AND btrim(nif) <> ''
  UNION ALL
  SELECT 'organizacoes', nif FROM public.organizacoes
   WHERE nif IS NOT NULL AND btrim(nif) <> ''
),
norm AS (
  SELECT tabela, regexp_replace(nif, '\s', '', 'g') AS n FROM nifs
),
aval AS (
  SELECT tabela,
    (n ~ '^[0-9]{9}$'
     AND substr(n,1,1) IN ('1','2','3','5','6','7','8','9')
     AND n NOT IN ('999999990','999999999')
     AND (CASE WHEN (9*substr(n,1,1)::int + 8*substr(n,2,1)::int + 7*substr(n,3,1)::int
                   + 6*substr(n,4,1)::int + 5*substr(n,5,1)::int + 4*substr(n,6,1)::int
                   + 3*substr(n,7,1)::int + 2*substr(n,8,1)::int) % 11 < 2
               THEN 0
               ELSE 11 - ((9*substr(n,1,1)::int + 8*substr(n,2,1)::int + 7*substr(n,3,1)::int
                         + 6*substr(n,4,1)::int + 5*substr(n,5,1)::int + 4*substr(n,6,1)::int
                         + 3*substr(n,7,1)::int + 2*substr(n,8,1)::int) % 11)
          END) = substr(n,9,1)::int
    ) AS valido
  FROM norm
)
SELECT tabela,
       count(*)                       AS nifs_preenchidos,
       count(*) FILTER (WHERE valido)     AS validos,
       count(*) FILTER (WHERE NOT valido) AS invalidos
  FROM aval
 GROUP BY tabela
 ORDER BY tabela;

-- ────────────────────────────────────────────────────────────
-- 3) IBANs inválidos (detalhe) — motoristas + clientes
-- ────────────────────────────────────────────────────────────
WITH ibans AS (
  SELECT 'motoristas_ativos' AS tabela, id::text AS id, nome, iban
    FROM public.motoristas_ativos
   WHERE iban IS NOT NULL AND btrim(iban) <> ''
  UNION ALL
  SELECT 'clientes', id::text, nome, iban
    FROM public.clientes
   WHERE iban IS NOT NULL AND btrim(iban) <> '' AND deleted_at IS NULL
),
norm AS (
  SELECT *, upper(regexp_replace(iban, '\s', '', 'g')) AS ib FROM ibans
),
expandido AS (
  SELECT tabela, id, nome, iban, ib,
    -- Mover 4 primeiros chars para o fim e expandir letras (A=10 … Z=35)
    (SELECT string_agg(
              CASE WHEN c BETWEEN 'A' AND 'Z' THEN (ascii(c) - 55)::text ELSE c END,
              '' ORDER BY ord)
       FROM unnest(string_to_array(substr(ib, 5) || substr(ib, 1, 4), NULL))
            WITH ORDINALITY AS t(c, ord)) AS numerico
  FROM norm
)
SELECT tabela, id, nome, iban,
  CASE
    WHEN ib !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]+$' THEN 'formato inválido'
    WHEN ib LIKE 'PT%' AND length(ib) <> 25 THEN 'IBAN PT deve ter 25 caracteres (tem ' || length(ib) || ')'
    WHEN numerico !~ '^[0-9]+$' THEN 'caracteres inválidos'
    WHEN mod(numerico::numeric, 97) <> 1 THEN 'checksum errado (mod-97)'
  END AS motivo
  FROM expandido
 WHERE NOT (
   ib ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]+$'
   AND (ib NOT LIKE 'PT%' OR length(ib) = 25)
   AND numerico ~ '^[0-9]+$'
   AND mod(numerico::numeric, 97) = 1
 )
 ORDER BY tabela, nome;

-- ────────────────────────────────────────────────────────────
-- 4) IBANs — resumo por tabela
-- ────────────────────────────────────────────────────────────
WITH ibans AS (
  SELECT 'motoristas_ativos' AS tabela, iban FROM public.motoristas_ativos
   WHERE iban IS NOT NULL AND btrim(iban) <> ''
  UNION ALL
  SELECT 'clientes', iban FROM public.clientes
   WHERE iban IS NOT NULL AND btrim(iban) <> '' AND deleted_at IS NULL
),
norm AS (
  SELECT tabela, upper(regexp_replace(iban, '\s', '', 'g')) AS ib FROM ibans
),
expandido AS (
  SELECT tabela, ib,
    (SELECT string_agg(
              CASE WHEN c BETWEEN 'A' AND 'Z' THEN (ascii(c) - 55)::text ELSE c END,
              '' ORDER BY ord)
       FROM unnest(string_to_array(substr(ib, 5) || substr(ib, 1, 4), NULL))
            WITH ORDINALITY AS t(c, ord)) AS numerico
  FROM norm
),
aval AS (
  SELECT tabela,
    (ib ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]+$'
     AND (ib NOT LIKE 'PT%' OR length(ib) = 25)
     AND numerico ~ '^[0-9]+$'
     AND mod(numerico::numeric, 97) = 1) AS valido
  FROM expandido
)
SELECT tabela,
       count(*)                       AS ibans_preenchidos,
       count(*) FILTER (WHERE valido)     AS validos,
       count(*) FILTER (WHERE NOT valido) AS invalidos
  FROM aval
 GROUP BY tabela
 ORDER BY tabela;
