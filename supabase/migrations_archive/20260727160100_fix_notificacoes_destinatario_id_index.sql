-- Correção trivial (Sub-projeto 9 da auditoria de automação): a migração
-- 20260629000004 tentou criar um índice em notificacoes(destinatario_id)
-- reutilizando o nome idx_notificacoes_destinatario — mas esse nome já
-- existia, apontando para destinatario_user_id (criado em
-- 20260626000000). O CREATE INDEX IF NOT EXISTS ficou, por isso, silencioso
-- e sem efeito: destinatario_id nunca teve índice próprio. Correção
-- puramente aditiva — não altera nem remove o índice/coluna antigos.

create index if not exists idx_notificacoes_destinatario_id
  on public.notificacoes (destinatario_id)
  where destinatario_id is not null;
