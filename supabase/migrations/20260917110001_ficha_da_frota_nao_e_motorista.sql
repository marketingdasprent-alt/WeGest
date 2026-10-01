-- A própria empresa tem ficha de motorista no CRM, e aparece nos Resumos e no
-- Relatório de Pagamento como se fosse uma pessoa a receber.
--
-- Em produção é a ficha "PREMIUM RIDE" (motoristas_ativos), com exactamente o
-- nome da organização. O filtro que existia — isCompanyName(), uma regex à
-- procura de "Lda", "S.A.", "Unipessoal" — apanha "Década Ousada, Lda." e
-- "URBANGO Lda" (que vêm da Uber com sufixo), mas não apanha "PREMIUM RIDE",
-- que não tem sufixo nenhum. Adivinhar pelo nome nunca vai ser fiável.
--
-- Isto é a contraparte de uber_drivers.is_conta_frota (migração 20260911140000)
-- do lado do CRM: lá era a conta da frota na Uber, aqui é a ficha da frota no
-- nosso próprio cadastro. Mesma ideia, mesma coluna, mesmo nome.

ALTER TABLE public.motoristas_ativos
  ADD COLUMN IF NOT EXISTS is_conta_frota boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.motoristas_ativos.is_conta_frota IS
  'A ficha é a própria empresa, não uma pessoa. Excluída dos Resumos, do Relatório de Pagamento e de tudo o que trate a ficha como alguém a quem se paga. Contraparte de uber_drivers.is_conta_frota.';

-- Backfill: ficha cujo nome é o nome da organização a que pertence. Comparação
-- por norm_nome_match() (minúsculas, sem acentos, espaços colapsados) — o CRM
-- tem "PREMIUM RIDE" e a organização "PREMIUM RIDE", mas nada garante a mesma
-- caixa amanhã.
--
-- Deliberadamente só o nome da PRÓPRIA organização, não de todas: um motorista
-- real chamado como a empresa de outro cliente continua a ser um motorista.
UPDATE public.motoristas_ativos m
   SET is_conta_frota = true
  FROM public.organizacoes o
 WHERE o.id = m.org_id
   AND m.is_conta_frota = false
   AND public.norm_nome_match(m.nome) = public.norm_nome_match(o.nome);
