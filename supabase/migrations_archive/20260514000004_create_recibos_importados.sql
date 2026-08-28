-- ============================================================
-- Tabela para recibos semanais importados (PDF)
-- Quando existe um recibo importado para um motorista+semana,
-- os valores do recibo sobrepõem os calculados automaticamente
-- ============================================================

CREATE TABLE IF NOT EXISTS public.recibos_importados (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  motorista_id uuid REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL,
  motorista_nome text NOT NULL,
  semana_inicio date NOT NULL,
  semana_fim date NOT NULL,
  semana_numero integer,

  -- Valores extraídos do PDF
  faturado_uber numeric(12,2) DEFAULT 0,
  faturado_bolt numeric(12,2) DEFAULT 0,
  aluguer numeric(12,2) DEFAULT 0,
  combustivel numeric(12,2) DEFAULT 0,
  via_verde numeric(12,2) DEFAULT 0,
  outras_receitas numeric(12,2) DEFAULT 0,
  outros_custos numeric(12,2) DEFAULT 0,
  caucao numeric(12,2) DEFAULT 0,
  seguros numeric(12,2) DEFAULT 0,
  reparacoes numeric(12,2) DEFAULT 0,
  valores_anteriores numeric(12,2) DEFAULT 0,
  total_receber numeric(12,2) DEFAULT 0,
  iva_percentagem numeric(5,2) DEFAULT 0,
  irs_percentagem numeric(5,2) DEFAULT 0,
  liquido numeric(12,2) DEFAULT 0,

  -- Ficheiro
  ficheiro_url text,

  -- Multi-tenant
  org_id uuid REFERENCES public.organizacoes(id),
  importado_por uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Um recibo por motorista por semana
  CONSTRAINT unique_motorista_semana_recibo UNIQUE (motorista_id, semana_inicio, org_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_recibos_importados_semana ON public.recibos_importados (semana_inicio, semana_fim);
CREATE INDEX IF NOT EXISTS idx_recibos_importados_motorista ON public.recibos_importados (motorista_id);
CREATE INDEX IF NOT EXISTS idx_recibos_importados_org ON public.recibos_importados (org_id);

-- RLS
ALTER TABLE public.recibos_importados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mt_recibos_importados_select" ON public.recibos_importados
  FOR SELECT USING (org_id = get_current_org_id());

CREATE POLICY "mt_recibos_importados_insert" ON public.recibos_importados
  FOR INSERT WITH CHECK (org_id = get_current_org_id());

CREATE POLICY "mt_recibos_importados_update" ON public.recibos_importados
  FOR UPDATE USING (org_id = get_current_org_id());

CREATE POLICY "mt_recibos_importados_delete" ON public.recibos_importados
  FOR DELETE USING (org_id = get_current_org_id() AND is_current_user_admin());
