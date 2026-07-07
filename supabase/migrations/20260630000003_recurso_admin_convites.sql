-- ============================================================
-- Recurso de permissão: Gerir convites / links de registo
-- ============================================================
-- Aparece na categoria Administração do editor de grupo. Controla
-- quem vê e usa a aba "Convites" das Configurações (convite de
-- colaborador + link de registo de motorista).
--   tem_acesso (Ver)  → abre a aba, copia links existentes
--   pode_editar (Editar) → gera/envia convites e links
-- Idempotente.
-- ============================================================

INSERT INTO public.recursos (nome, categoria, descricao)
VALUES (
  'admin_convites',
  'Administração',
  'Gerir convites de colaborador e link de registo de motorista'
)
ON CONFLICT (nome) DO NOTHING;
