-- ============================================================
-- Catálogo de campos dinâmicos — campos criados pelo provider
-- ============================================================
-- Só a org PROVIDER (Década Ousada) pode CRIAR campos novos. Cada campo
-- novo é um ALIAS para um campo já existente do sistema (coluna `fonte`):
-- ao gerar o documento, {{chave}} é substituído por {{fonte}} antes da
-- resolução normal. Garante que todo o campo resolve sempre.
--
-- Os campos aqui são GLOBAIS (visíveis a todas as orgs — fazem parte do
-- catálogo do produto). Cada org continua a escolher visibilidade/rótulo
-- em org_campos_dinamicos.
-- Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.campos_catalogo (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave      text NOT NULL UNIQUE,          -- placeholder inserido: {{chave}}
  label      text NOT NULL,                 -- rótulo default
  categoria  text NOT NULL,                 -- motorista | empresa | viatura | contrato
  fonte      text NOT NULL,                 -- chave canónica do sistema a que mapeia
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT campos_catalogo_categoria_chk
    CHECK (categoria IN ('motorista', 'empresa', 'viatura', 'contrato'))
);

ALTER TABLE public.campos_catalogo ENABLE ROW LEVEL SECURITY;

-- Leitura: todas as orgs (faz parte do catálogo do produto).
DROP POLICY IF EXISTS campos_catalogo_select ON public.campos_catalogo;
CREATE POLICY campos_catalogo_select ON public.campos_catalogo
  FOR SELECT TO authenticated
  USING (true);

-- Escrita: SÓ a org provider (Década Ousada).
DROP POLICY IF EXISTS campos_catalogo_manage ON public.campos_catalogo;
CREATE POLICY campos_catalogo_manage ON public.campos_catalogo
  FOR ALL TO authenticated
  USING (public.get_current_org_id() = '11111111-1111-1111-1111-111111111111'::uuid)
  WITH CHECK (public.get_current_org_id() = '11111111-1111-1111-1111-111111111111'::uuid);

COMMENT ON TABLE public.campos_catalogo IS
  'Campos dinâmicos criados pelo provider (alias→fonte). Escrita só Década Ousada; leitura global. Catálogo base em src/lib/camposDinamicos.ts.';
