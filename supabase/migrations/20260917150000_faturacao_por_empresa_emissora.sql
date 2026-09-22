-- ============================================================
-- Cada integração de faturação pertence a uma empresa emissora
-- ============================================================
-- O QUE ESTAVA MAL
--
-- A configuração de faturação era POR ORGANIZAÇÃO: uma única linha activa em
-- `plataformas_configuracao` com `plataforma = 'faturacao'`, garantida pelo
-- índice `uq_plataformas_configuracao_faturacao_ativa (org_id)`.
--
-- Só que quem emite a factura não é a organização, é a empresa emissora do
-- contrato (`contratos_renting.emissor_id` → `clientes.is_emissora`). Uma
-- organização tem várias. Em produção, a 2026-09-17, uma só chave KeyInvoice
-- tinha emitido 199 facturas em nome de CINCO empresas diferentes:
--
--   Dasp Rent Sul 167 · Dasprent Rent A Car 15 · Distância Arrojada 12 ·
--   Década Ousada 3 · Urbango 2
--
-- Cada uma destas é um sujeito fiscal distinto, com o seu NIF e a sua conta no
-- software de facturação. Emitir por todas a partir de uma conta só é errado.
--
-- O QUE MUDA
--
--   · `plataformas_configuracao.emissor_id` diz de que empresa é a integração.
--   · O índice único passa a ser por (org_id, emissor_id): cada empresa tem a
--     SUA integração activa, e várias empresas coexistem na mesma organização.
--   · Continua a caber uma linha sem empresa por organização (emissor_id nulo),
--     que é o estado em que a linha actual fica até alguém lhe atribuir uma
--     empresa. Essa linha NÃO serve para emitir — quem emite é a edge function
--     `faturacao-emitir`, e essa exige uma integração da empresa do documento.
--
-- Nada é apagado nem reatribuído aqui: escolher a que empresa pertence a chave
-- que já existe é uma decisão de negócio, não de migração. Até ser feita, a
-- emissão pára — que é exactamente o comportamento pedido: uma empresa sem
-- integração de facturação não pode ser facturada.
-- ============================================================

ALTER TABLE public.plataformas_configuracao
  ADD COLUMN IF NOT EXISTS emissor_id uuid REFERENCES public.clientes (id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.plataformas_configuracao.emissor_id IS
  'Empresa emissora (clientes.is_emissora) em nome da qual esta integração de faturação emite. Só se aplica a plataforma = ''faturacao''. Sem empresa, a integração não emite nada.';

-- Uma integração de faturação activa POR EMPRESA, em vez de uma por organização.
DROP INDEX IF EXISTS public.uq_plataformas_configuracao_faturacao_ativa;

CREATE UNIQUE INDEX IF NOT EXISTS uq_faturacao_ativa_por_emissor
  ON public.plataformas_configuracao (org_id, emissor_id)
  WHERE plataforma = 'faturacao' AND ativo = true AND emissor_id IS NOT NULL;

-- `NULLS NOT DISTINCT` não serve aqui (Postgres 15+, mas muda o significado do
-- índice acima), por isso a linha ainda sem empresa tem o seu próprio índice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_faturacao_ativa_sem_emissor
  ON public.plataformas_configuracao (org_id)
  WHERE plataforma = 'faturacao' AND ativo = true AND emissor_id IS NULL;

-- Só a faturação usa esta coluna. Uma integração da Bolt ou da Uber com uma
-- empresa emissora agarrada seria um erro silencioso.
ALTER TABLE public.plataformas_configuracao
  DROP CONSTRAINT IF EXISTS plataformas_configuracao_emissor_so_na_faturacao;

ALTER TABLE public.plataformas_configuracao
  ADD CONSTRAINT plataformas_configuracao_emissor_so_na_faturacao
  CHECK (emissor_id IS NULL OR plataforma = 'faturacao');

CREATE INDEX IF NOT EXISTS idx_plataformas_configuracao_emissor
  ON public.plataformas_configuracao (emissor_id)
  WHERE emissor_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
