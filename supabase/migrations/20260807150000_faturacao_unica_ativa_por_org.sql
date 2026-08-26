-- ============================================================
-- Faturação: no máximo UMA integração activa (em produção) por org
-- ============================================================
-- KeyInvoice e Primavera passam a ser integrações completamente
-- independentes (linhas próprias em plataformas_configuracao, uma por
-- provider), em vez de partilharem uma única linha "Faturação" trocada
-- por um dropdown. Mas continuam a ser SOFTWARES DE FACTURAÇÃO — emitir
-- o mesmo documento fiscal em dois ao mesmo tempo não faz sentido nenhum
-- (duplica-se o documento legal). Este índice garante isso ao nível da
-- BD: só pode haver uma linha com ativo=true por org.
--
-- Sem isto, a edge function faturacao-emitir (getOrgConfig) rebentava
-- com "multiple rows returned" (.maybeSingle()) assim que uma segunda
-- integração de faturação ficasse ativa na mesma org.
CREATE UNIQUE INDEX IF NOT EXISTS uq_plataformas_configuracao_faturacao_ativa
  ON public.plataformas_configuracao (org_id)
  WHERE plataforma = 'faturacao' AND ativo = true;
