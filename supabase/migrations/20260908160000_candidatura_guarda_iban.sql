-- A candidatura passa a ter onde guardar o IBAN.
--
-- O formulário de candidatura em produção pede o IBAN e envia-o no payload
-- (`iban`, normalizado sem espaços e em maiúsculas) desde que o campo foi
-- acrescentado — mas a coluna nunca chegou à base. É a deriva ao contrário: o
-- código à frente do esquema.
--
-- Resultado: TODAS as candidaturas falhavam. O PostgREST recusava o INSERT
-- com "Could not find the 'iban' column of 'motorista_candidaturas' in the
-- schema cache" — 400, sem chegar sequer ao Postgres, e por isso sem deixar
-- rasto nos logs da base. A última candidatura criada com sucesso é de
-- 2026-09-03; a 2026-09-08 dois candidatos tentaram onze vezes.
--
-- O comprovativo já cá estava (`comprovativo_iban_url`) desde o início — só
-- faltava o número a que o documento diz respeito.
--
-- Mesmo tipo que motoristas_ativos.iban (text, nullable): é para lá que o
-- valor é copiado quando a candidatura é aprovada.

ALTER TABLE public.motorista_candidaturas
  ADD COLUMN IF NOT EXISTS iban text;

COMMENT ON COLUMN public.motorista_candidaturas.iban IS
  'IBAN indicado pelo candidato, normalizado pelo formulário (sem espaços, maiúsculas). Par do comprovativo_iban_url. Copiado para motoristas_ativos.iban ao aprovar.';

-- Ver AGENTS.md: toda a migração que mexe em estrutura acaba com isto, ou a
-- API continua a recusar a coluna até ao próximo reload.
NOTIFY pgrst, 'reload schema';
