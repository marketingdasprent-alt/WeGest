-- Denormaliza o nome da integração/conta Via Verde em cada transação, para
-- ficar visível diretamente na tabela (sem join) qual importação/conta gerou
-- aquele dado, e quando (created_at já guarda o dia/hora da 1ª importação).
-- Necessário para rastreabilidade agora que passa a haver várias integrações
-- Via Verde (multi-conta).
ALTER TABLE public.via_verde_transacoes
  ADD COLUMN IF NOT EXISTS integracao_nome text;

-- Backfill das linhas já existentes, a partir do nome atual da integração.
UPDATE public.via_verde_transacoes t
SET integracao_nome = pc.nome
FROM public.plataformas_configuracao pc
WHERE pc.id = t.integracao_id
  AND t.integracao_nome IS NULL;
