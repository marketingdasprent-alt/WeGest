-- ============================================================
-- Backfill: permissão do recurso "viaturas_grupos" em falta
-- ============================================================
-- O recurso "viaturas_grupos" foi criado em 20260706 (migration do
-- editor de grupos/tarifas), mas nenhuma migration populou
-- cargo_permissoes para os cargos já existentes — só ensure_base_cargos()
-- concede automaticamente, e essa função só corre na criação de uma
-- org nova ou no backfill pontual de 20260629 (8 dias antes deste
-- recurso existir). Resultado: só 2 de 19 cargos (em todas as orgs)
-- tinham a permissão — qualquer utilizador não-owner (is_admin=false
-- em user_organizacoes) ficava bloqueado com 42501 ao editar tarifas
-- por modelo (renting_tarifa_precos_modelo).
--
-- Fix: espelha, por org/cargo, a permissão já configurada no recurso
-- irmão "viaturas_financeiro" (mesma família — configuração de frota) —
-- é o baseline mais próximo do que já foi decidido manualmente por
-- org. Idempotente via ON CONFLICT.
-- ============================================================

INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, org_id, tem_acesso, pode_editar)
SELECT
  cp_financeiro.cargo_id,
  r_grupos.id,
  c.org_id,
  true,
  true
FROM public.cargo_permissoes cp_financeiro
JOIN public.recursos r_financeiro ON r_financeiro.id = cp_financeiro.recurso_id AND r_financeiro.nome = 'viaturas_financeiro'
JOIN public.recursos r_grupos ON r_grupos.nome = 'viaturas_grupos'
JOIN public.cargos c ON c.id = cp_financeiro.cargo_id
WHERE cp_financeiro.tem_acesso = true
  AND cp_financeiro.pode_editar = true
ON CONFLICT (cargo_id, recurso_id) DO UPDATE
  SET tem_acesso = true,
      pode_editar = true;
