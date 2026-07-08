-- ============================================================
-- Re-assert do módulo "Administrativo" nas permissões de grupo
-- ============================================================
-- O accordion "Administrativo" no seletor de permissões (e o toggle que
-- liga/desliga a aba na sidebar) só aparece se existirem linhas em
-- public.recursos com categoria = 'Administrativo'. A migração original
-- (20260603120000) não chegou a correr em todos os ambientes, deixando os
-- recursos na categoria antiga 'Financeiro' (ou em falta) — pelo que a aba
-- não podia ser atribuída aos grupos.
--
-- Esta migração tem um timestamp novo (garante execução) e é idempotente:
-- pode correr quantas vezes for preciso sem efeitos colaterais.
-- ============================================================

-- 1) Renomear qualquer resto da categoria antiga
UPDATE public.recursos SET categoria = 'Administrativo' WHERE categoria = 'Financeiro';

-- 2) Garantir a categoria certa nos recursos legacy do módulo
UPDATE public.recursos
SET categoria = 'Administrativo'
WHERE nome IN ('financeiro_recibos', 'recibos_verdes_adicionar');

-- 3) Garantir todos os recursos granulares do módulo (idempotente — nome é UNIQUE)
INSERT INTO public.recursos (nome, descricao, categoria) VALUES
  ('administrativo_resumos',     'Ver resumos e contas dos motoristas',                 'Administrativo'),
  ('administrativo_importar',    'Importar dados das plataformas (CSV)',                'Administrativo'),
  ('administrativo_plataformas', 'Ver dados das plataformas (Bolt/Uber/BP/Repsol/EDP)', 'Administrativo'),
  ('administrativo_cartoes',     'Gerir cartões de frota e dispositivos OBE',           'Administrativo')
ON CONFLICT (nome) DO UPDATE
  SET categoria = EXCLUDED.categoria,
      descricao = EXCLUDED.descricao;
