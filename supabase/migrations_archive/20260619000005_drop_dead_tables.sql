-- ============================================================
-- DROP de 2 tabelas mortas / legacy (auditoria adversarial 2026-06-19)
-- ============================================================
-- Confirmado por investigação exaustiva + verificação cética (zero FKs de
-- entrada, zero uso em runtime, zero views/triggers/funções externas):
--
--   empresa_dasprent  — legacy single-tenant da app original "DasPrent".
--                       Só DDL + types.ts. As IRMÃS leads_dasprent /
--                       funcionarios_dasprent ESTÃO em uso — NÃO tocar nelas.
--   leads_encontro    — tabela morta criada no dashboard (sem CREATE em
--                       migrations). Policies {public} abertas a anónimos
--                       (exposição latente) — a remoção fecha-a.
--
-- ⚠️ ANTES DE APLICAR: correr os SELECT count(*) (convenção do projeto) e
-- confirmar que não há dados a preservar — sobretudo em leads_encontro, que
-- tem INSERT público aberto e pode ter linhas residuais.
--
-- DROP sem CASCADE de propósito: a auditoria confirmou zero dependências, por
-- isso se houver alguma dependência inesperada queremos que FALHE em vez de
-- destruir em cascata silenciosa. Idempotente (IF EXISTS) — deploy à mão.
-- ============================================================

DROP TABLE IF EXISTS public.empresa_dasprent;
DROP TABLE IF EXISTS public.leads_encontro;
