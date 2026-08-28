-- 147 eventos de calendário ligados a contratos_renting tinham org_id NULL
-- (import/seed em lote sem sessão de app — get_current_org_id() resolveu
-- NULL, o DEFAULT da coluna). RLS (rls_org_isolation, RESTRICTIVE) exige
-- org_id = org actual; NULL nunca bate certo, por isso ficavam invisíveis
-- no calendário para toda a gente, incl. 110 entregas/recolhas pendentes.
-- Idempotente: só toca linhas que ainda tenham org_id NULL.
UPDATE public.calendario_eventos ce
SET org_id = cr.org_id
FROM public.contratos_renting cr
WHERE ce.origem_id = cr.id
  AND ce.origem_tipo = 'contrato_renting'
  AND ce.org_id IS NULL;
