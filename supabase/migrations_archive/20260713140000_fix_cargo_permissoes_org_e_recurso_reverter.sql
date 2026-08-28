-- ============================================================================
-- 1) Corrige o "duplicate key" ao guardar grupos de permissões
-- ============================================================================
-- Muitas linhas legadas de cargo_permissoes têm org_id = NULL. O RLS só deixa
-- um admin-de-org apagar/atualizar linhas com org_id = get_current_org_id(), por
-- isso as linhas NULL sobreviviam ao DELETE mas colidiam no INSERT (unique
-- (cargo_id, recurso_id)) — dando "duplicate key" e deixando o grupo vazio.
--
-- Como os cargos são org-scoped (cargos.org_id), atribui-se cada permissão
-- legada à org do seu cargo. Verificado como seguro: 0 colisões, 0 permissões
-- com org diferente do cargo, 0 cargos sem org entre as linhas afetadas.
UPDATE public.cargo_permissoes cp
SET org_id = c.org_id
FROM public.cargos c
WHERE cp.cargo_id = c.id
  AND cp.org_id IS NULL
  AND c.org_id IS NOT NULL;

-- ============================================================================
-- 2) Novo recurso de permissão: "Reverter contrato para reserva"
-- ============================================================================
-- Permissão dedicada (módulo Contratos) para reverter um contrato agendado de
-- volta a reserva. Recursos são globais (sem org_id); os grupos atribuem o nível
-- em cargo_permissoes. Idempotente.
INSERT INTO public.recursos (nome, categoria, descricao)
SELECT 'contratos_reverter_reserva', 'Contratos', 'Reverter um contrato agendado de volta a reserva'
WHERE NOT EXISTS (
  SELECT 1 FROM public.recursos WHERE nome = 'contratos_reverter_reserva'
);
