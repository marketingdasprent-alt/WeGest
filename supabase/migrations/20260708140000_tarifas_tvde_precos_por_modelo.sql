-- ============================================================
-- Tarifas TVDE com preço por modelo
-- ============================================================
-- Uma tarifa marcada como TVDE (renting_tarifas.tipo = 'tvde')
-- pode definir um preço SEMANAL específico por cada modelo de
-- viatura. Ao criar contrato/reserva TVDE, o preço aplicado é o
-- da linha (tarifa, modelo) da viatura escolhida. Se o modelo não
-- tiver preço nessa tarifa, o frontend bloqueia + avisa.
--
-- Também acrescenta as colunas de tempos de reserva que o
-- formulário de tarifa já usava mas que não existiam na BD
-- (eram gravadas/lidas com casts `as any` e perdiam-se).
-- ============================================================

-- ── Tempos de reserva por tarifa (sobrepõem os do grupo) ──
ALTER TABLE public.renting_tarifas
  ADD COLUMN IF NOT EXISTS reserva_min_minutos integer CHECK (reserva_min_minutos IS NULL OR reserva_min_minutos >= 0),
  ADD COLUMN IF NOT EXISTS reserva_max_minutos integer CHECK (reserva_max_minutos IS NULL OR reserva_max_minutos >= 0);

COMMENT ON COLUMN public.renting_tarifas.reserva_min_minutos IS
  'Tempo mínimo de reserva (min) para esta tarifa. NULL = herda do grupo.';
COMMENT ON COLUMN public.renting_tarifas.reserva_max_minutos IS
  'Tempo máximo de reserva (min) para esta tarifa. NULL = herda do grupo.';
COMMENT ON COLUMN public.renting_tarifas.tipo IS
  'Regime da tarifa: renting (rent-a-car) ou tvde. Tarifas tvde só ficam disponíveis em contratos/reservas TVDE e usam preço por modelo (renting_tarifa_precos_modelo).';

-- ============================================================
-- Tabela: preço semanal por modelo, para tarifas TVDE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.renting_tarifa_precos_modelo (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  tarifa_id     uuid NOT NULL REFERENCES public.renting_tarifas(id) ON DELETE CASCADE,
  modelo_id     uuid NOT NULL REFERENCES public.viatura_modelos(id) ON DELETE CASCADE,

  -- No TVDE o aluguer é semanal → preço por semana para este modelo
  preco_semana  numeric(10,2) NOT NULL CHECK (preco_semana >= 0),

  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT renting_tarifa_precos_modelo_uniq UNIQUE (tarifa_id, modelo_id)
);

CREATE INDEX IF NOT EXISTS idx_rtpm_org      ON public.renting_tarifa_precos_modelo (org_id);
CREATE INDEX IF NOT EXISTS idx_rtpm_tarifa   ON public.renting_tarifa_precos_modelo (tarifa_id);
CREATE INDEX IF NOT EXISTS idx_rtpm_modelo   ON public.renting_tarifa_precos_modelo (modelo_id);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.touch_rtpm_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rtpm_updated_at ON public.renting_tarifa_precos_modelo;
CREATE TRIGGER trg_rtpm_updated_at
  BEFORE UPDATE ON public.renting_tarifa_precos_modelo
  FOR EACH ROW EXECUTE FUNCTION public.touch_rtpm_updated_at();

-- ============================================================
-- RLS — multi-tenant (mesmo padrão de renting_tarifas: leitura por
-- org; escrita com permissão de edição de viaturas_grupos)
-- ============================================================
ALTER TABLE public.renting_tarifa_precos_modelo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mt_rtpm_select" ON public.renting_tarifa_precos_modelo;
DROP POLICY IF EXISTS "mt_rtpm_insert" ON public.renting_tarifa_precos_modelo;
DROP POLICY IF EXISTS "mt_rtpm_update" ON public.renting_tarifa_precos_modelo;
DROP POLICY IF EXISTS "mt_rtpm_delete" ON public.renting_tarifa_precos_modelo;

CREATE POLICY "mt_rtpm_select" ON public.renting_tarifa_precos_modelo
  FOR SELECT TO authenticated
  USING (org_id = get_current_org_id());

CREATE POLICY "mt_rtpm_insert" ON public.renting_tarifa_precos_modelo
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = get_current_org_id()
    AND has_permission_edit(auth.uid(), 'viaturas_grupos')
  );

CREATE POLICY "mt_rtpm_update" ON public.renting_tarifa_precos_modelo
  FOR UPDATE TO authenticated
  USING (
    org_id = get_current_org_id()
    AND has_permission_edit(auth.uid(), 'viaturas_grupos')
  );

CREATE POLICY "mt_rtpm_delete" ON public.renting_tarifa_precos_modelo
  FOR DELETE TO authenticated
  USING (
    org_id = get_current_org_id()
    AND has_permission_edit(auth.uid(), 'viaturas_grupos')
  );

COMMENT ON TABLE public.renting_tarifa_precos_modelo IS
  'Preço semanal por modelo de viatura, específico de uma tarifa TVDE (renting_tarifas.tipo = tvde). Ao criar contrato/reserva TVDE, o preço aplicado é o da linha (tarifa, modelo da viatura).';
COMMENT ON COLUMN public.renting_tarifa_precos_modelo.preco_semana IS
  'Preço por semana (€) para este modelo nesta tarifa TVDE.';
