-- ============================================================
-- Remover o provisionamento automático de subdomínios.
--
-- A funcionalidade nunca foi ativada (as settings app.settings.* e os
-- segredos Cloudflare/Vercel nunca foram configurados) e a app passou a
-- funcionar exclusivamente em wegest.pt, com a org resolvida pelo código
-- no login + seletor de org na sidebar. O trigger só deixava as orgs
-- eternamente em dominio_status='pendente'.
--
-- As colunas dominio_status/dominio_erro ficam (inofensivas e evitam
-- partir código antigo); só o mecanismo ativo é removido. Idempotente.
-- ============================================================

drop trigger if exists on_org_provision_domain on public.organizacoes;
drop function if exists public.trigger_provision_domain();
