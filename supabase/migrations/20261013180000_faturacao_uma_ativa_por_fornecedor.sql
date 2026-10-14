-- Uma integração de faturação ativa por empresa E fornecedor: KeyInvoice e Primavera podem
-- estar os dois ativos e quem fatura escolhe por qual emitir. Idempotente: em produção o
-- índice novo já existe e o antigo já foi removido (2026-10-13).

drop index if exists public.uq_faturacao_ativa_por_emissor;

-- Sem provider conta como keyinvoice e sem distinguir maiúsculas, como configDaLinha.
create unique index if not exists uq_faturacao_ativa_por_emissor_fornecedor
  on public.plataformas_configuracao (org_id, emissor_id, (lower(coalesce(config->>'provider', 'keyinvoice'))))
  where plataforma = 'faturacao' and ativo = true and emissor_id is not null;

NOTIFY pgrst, 'reload schema';
