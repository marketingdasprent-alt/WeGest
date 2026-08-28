-- ============================================================
-- Recurso de permissão: "Minha Organização"
-- ============================================================
-- Aparece na categoria Administração do editor de grupo. Controla a
-- aba "Minha Organização" das Configurações (nome, código, logo, NIF,
-- morada, telefone da org ativa).
--   tem_acesso (Ver)     → abre a aba em modo leitura
--   pode_editar (Editar) → pode alterar os dados da organização
--
-- Pedido: todos os utilizadores devem ver por defeito, só admin edita
-- (admin já passa sempre via bypass isAdmin em hasAccessToResource/
-- canEdit). Por isso este recurso, ao contrário dos outros recursos
-- admin_*, já nasce com tem_acesso=true para todos os cargos
-- existentes — não fica fechado à espera que o admin abra "Ver" por
-- grupo. Idempotente.
-- ============================================================

INSERT INTO public.recursos (nome, categoria, descricao)
VALUES (
  'admin_minha_organizacao',
  'Administração',
  'Ver e editar os dados da organização (nome, código, logo, NIF, morada, telefone)'
)
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, org_id, tem_acesso, pode_editar)
SELECT
  c.id,
  r.id,
  c.org_id,
  true,
  false
FROM public.cargos c
CROSS JOIN public.recursos r
WHERE r.nome = 'admin_minha_organizacao'
ON CONFLICT (cargo_id, recurso_id) DO UPDATE
  SET tem_acesso = true;
