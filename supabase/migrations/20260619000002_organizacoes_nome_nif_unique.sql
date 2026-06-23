-- ============================================================
-- Unicidade de organizacoes: nome (case-insensitive) + NIF
-- ============================================================
-- BUG: ao criar uma organização verificava-se apenas o `codigo` (que já é
-- UNIQUE). O nome da empresa e o NIF não eram verificados, permitindo criar
-- orgs com nome/NIF duplicados → conflitos de identidade/faturação.
--
-- A verificação primária fica na edge function register-org (mensagens
-- amigáveis); estes índices são a garantia ao nível da BD (corridas / inserts
-- directos).
--
-- ⚠️ NOTA: se já existirem orgs com nome ou NIF duplicados (ex.: orgs de
-- teste), renomeá-las/removê-las ANTES de aplicar — a criação do índice
-- único falha enquanto houver duplicados. Para detetar:
--   SELECT lower(btrim(nome)), count(*) FROM organizacoes
--     GROUP BY 1 HAVING count(*) > 1;
--   SELECT nif, count(*) FROM organizacoes
--     WHERE nif IS NOT NULL AND btrim(nif) <> '' GROUP BY 1 HAVING count(*) > 1;
-- ============================================================

-- Nome único, case-insensitive e sem espaços nas pontas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizacoes_nome_lower
  ON public.organizacoes (lower(btrim(nome)));

-- NIF único (ignora null/vazio — nem todas as orgs têm NIF preenchido).
CREATE UNIQUE INDEX IF NOT EXISTS uq_organizacoes_nif
  ON public.organizacoes (btrim(nif))
  WHERE nif IS NOT NULL AND btrim(nif) <> '';
