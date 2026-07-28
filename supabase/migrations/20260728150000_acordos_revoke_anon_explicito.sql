-- supabase/migrations/20260728150000_acordos_revoke_anon_explicito.sql
-- ============================================================
-- Hardening: REVOKE explícito de anon/authenticated nas RPCs desta feature
-- ============================================================
-- Descoberto ao aplicar estas migrações a sério contra a BD real (não durante
-- nenhuma revisão de código): `REVOKE ALL ... FROM PUBLIC` não retira o
-- EXECUTE de `anon` neste projeto — existe um privilégio por-omissão a nível
-- de esquema que sobrevive ao REVOKE FROM PUBLIC. Confirmado por consulta
-- directa (has_function_privilege) depois de aplicar 20260724100000-100005:
-- TODAS as funções desta feature tinham anon_exec=true, incluindo as 2 que
-- deviam ser exclusivas de service_role e não têm guarda interna nenhuma
-- (dependem só do GRANT):
--   • acordos_manutencao_diaria — varrimento global, sem filtro de org
--   • faturacao_outbox_claim    — devolve payload de faturação de QUALQUER org
-- Um utilizador anónimo conseguia invocar as duas diretamente via
-- /rest/v1/rpc/... sem nenhuma sessão. As restantes funções têm guarda
-- interna (COALESCE(...has_renting_faturacao_access()...)) que rejeita um
-- chamador sem sessão — endurecidas aqui na mesma por defesa em profundidade,
-- não porque estivessem exploráveis na prática.
--
-- Verificado por consulta directa (has_function_privilege) depois de aplicar:
-- acordos_manutencao_diaria e faturacao_outbox_claim ficam anon=false,
-- authenticated=false, service_role=true; as restantes ficam anon=false,
-- authenticated=true, service_role=true (sem alteração ao que já usavam).

REVOKE EXECUTE ON FUNCTION public.acordos_manutencao_diaria(date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.faturacao_outbox_claim(integer) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.acordo_criar(
  uuid, text, uuid, jsonb, text, smallint, smallint, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.acordo_cancelar(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.acordo_parcela_liquidar(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.acordo_parcela_registar_pagamento(
  uuid, numeric, date, text, uuid, uuid, uuid, text, boolean, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.acordo_vista_devedor(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cobranca_saldo_por_liquidar(uuid) FROM anon;
