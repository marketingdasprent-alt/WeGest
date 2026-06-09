-- ============================================================
-- Módulo "Administrativo": renomear categoria + permissões granulares
-- ============================================================
-- A categoria "Financeiro" passa a "Administrativo" e ganha 4 recursos
-- novos para controlo fino do módulo (resumos, importação, dados das
-- plataformas, cartões/OBE). Idempotente (recursos.nome é UNIQUE).
-- ============================================================

-- 1) Renomear a categoria existente
UPDATE public.recursos SET categoria = 'Administrativo' WHERE categoria = 'Financeiro';

-- 2) Garantir que os recursos existentes do módulo ficam na categoria certa
UPDATE public.recursos
SET categoria = 'Administrativo'
WHERE nome IN ('financeiro_recibos', 'recibos_verdes_adicionar');

-- 3) Inserir os novos recursos (idempotente)
INSERT INTO public.recursos (nome, descricao, categoria) VALUES
  ('administrativo_resumos',     'Ver resumos e contas dos motoristas',                 'Administrativo'),
  ('administrativo_importar',    'Importar dados das plataformas (CSV)',                'Administrativo'),
  ('administrativo_plataformas', 'Ver dados das plataformas (Bolt/Uber/BP/Repsol/EDP)', 'Administrativo'),
  ('administrativo_cartoes',     'Gerir cartões de frota e dispositivos OBE',           'Administrativo')
ON CONFLICT (nome) DO UPDATE
  SET categoria = EXCLUDED.categoria,
      descricao = EXCLUDED.descricao;
