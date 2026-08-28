-- ============================================================
-- Recurso de permissão: Disponível para assistência
-- ============================================================
-- Aparece na categoria "Assistência" do editor de grupo, mas é usado como
-- um SIM/NÃO por grupo (não os 3 níveis normais): quando um grupo (cargo)
-- tem este recurso com tem_acesso=true, todos os seus membros passam a ser
-- selecionáveis como "assistente responsável" nos tickets de assistência.
--
-- Substitui a lista de cargos hardcoded que existia no frontend
-- (GESTOR_ASSISTENCIA_CARGO_IDS em NovoTicketDialog/TicketAccessPanel).
--
-- Default = "não" para todos os grupos (não semeamos cargo_permissoes) —
-- o admin ativa por-grupo na UI. Idempotente.
-- ============================================================

INSERT INTO public.recursos (nome, categoria, descricao)
VALUES (
  'assistencia_disponivel',
  'Assistência',
  'Grupo disponível para atribuição como assistente responsável nos tickets'
)
ON CONFLICT (nome) DO NOTHING;
