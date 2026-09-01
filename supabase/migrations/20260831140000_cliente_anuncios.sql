-- ============================================================
-- Anúncios em viaturas: elegibilidade e atribuição
-- ============================================================
-- O anúncio nasce sempre no CLIENTE (preço + período, sem viatura). A viatura
-- só liga a um anúncio que já existe e está livre — nunca cria um novo. Ver
-- docs/superpowers/specs/2026-08-31-anuncios-viaturas-design.md.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS elegivel_anuncios boolean NOT NULL DEFAULT false;

ALTER TABLE public.viaturas
  ADD COLUMN IF NOT EXISTS elegivel_anuncios boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.cliente_anuncios (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL DEFAULT get_current_org_id()
               REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  cliente_id   uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  -- Nulo = por atribuir. Estado inicial de todo anúncio novo.
  viatura_id   uuid REFERENCES public.viaturas(id) ON DELETE SET NULL,
  preco        numeric(10,2) NOT NULL CHECK (preco >= 0),
  data_inicio  date NOT NULL,
  data_fim     date NOT NULL CHECK (data_fim >= data_inicio),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at   timestamptz NOT NULL DEFAULT timezone('utc', now())
);

-- Uma viatura só leva um anúncio de cada vez.
CREATE UNIQUE INDEX IF NOT EXISTS cliente_anuncios_viatura_unica
  ON public.cliente_anuncios (viatura_id)
  WHERE viatura_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cliente_anuncios_cliente ON public.cliente_anuncios (cliente_id);
CREATE INDEX IF NOT EXISTS cliente_anuncios_por_atribuir
  ON public.cliente_anuncios (org_id)
  WHERE viatura_id IS NULL;

ALTER TABLE public.cliente_anuncios ENABLE ROW LEVEL SECURITY;

CREATE POLICY rls_deny_anon ON public.cliente_anuncios
  AS RESTRICTIVE TO anon USING (false);

CREATE POLICY rls_org_isolation ON public.cliente_anuncios
  AS RESTRICTIVE USING (org_id = get_current_org_id());

-- Leitura: quem gere clientes de renting OU quem vê viaturas (a faixa da
-- viatura precisa de ler anúncios por atribuir de QUALQUER cliente elegível,
-- não só dos que o utilizador giria).
CREATE POLICY cliente_anuncios_select ON public.cliente_anuncios FOR SELECT
  USING (
    has_renting_access()
    OR has_permission(auth.uid(), 'viaturas_ver')
    OR has_permission(auth.uid(), 'viaturas_editar')
  );

-- Escrita: quem gere clientes de renting OU quem edita viaturas (a atribuição
-- nasce do lado da viatura).
CREATE POLICY cliente_anuncios_write ON public.cliente_anuncios FOR ALL
  USING (has_renting_access() OR has_permission(auth.uid(), 'viaturas_editar'))
  WITH CHECK (has_renting_access() OR has_permission(auth.uid(), 'viaturas_editar'));

COMMENT ON TABLE public.cliente_anuncios IS
  'Anúncios publicitários em viaturas, por cliente de renting (só empresas). '
  'Nasce no cliente com preço e período; viatura_id fica nulo até uma viatura '
  'elegível escolher este anúncio na lista dos "por atribuir".';
