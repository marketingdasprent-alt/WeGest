-- ============================================================
-- Recurso de permissão: Reativar viaturas inativas
-- ============================================================
-- Aparece na categoria "Viaturas" do editor de grupo, usado como um
-- SIM/NÃO por cargo (não os 3 níveis normais): quando um cargo tem este
-- recurso com tem_acesso=true, os seus membros passam a poder reverter o
-- campo Estado de uma viatura de "Inativo" para "Disponível" na ficha da
-- viatura (aba Dados) — campo que hoje fica sempre bloqueado assim que a
-- viatura não está "Disponível".
--
-- Default = "não" para todos os cargos (não semeamos cargo_permissoes) —
-- o admin ativa por-cargo na UI. Admins da org continuam a contornar
-- sempre (is_current_user_admin / is_admin). Idempotente.
-- ============================================================

INSERT INTO public.recursos (nome, categoria, descricao)
VALUES (
  'viaturas_alterar_estado',
  'Viaturas',
  'Reativar viaturas inativas (mudar o Estado de "Inativo" para "Disponível")'
)
ON CONFLICT (nome) DO NOTHING;
