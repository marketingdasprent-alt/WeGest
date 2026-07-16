-- ============================================================
-- Caução no lead + rasto de match lead→motorista
-- ============================================================
-- Contexto: leads não tinham campo de caução; ao converter um lead em
-- motorista, o valor negociado (e o próprio lead de origem) perdiam-se.
-- Caução no lead é sempre manual — o modelo de dados actual não liga
-- lead a grupo/modelo de forma limpa (caução vive na grelha
-- tarifa×modelo, só alcançável via viaturas físicas), então não há
-- derivação automática aqui.
-- ============================================================

ALTER TABLE public.leads_dasprent
  ADD COLUMN IF NOT EXISTS caucao_valor numeric(10,2) NULL;

ALTER TABLE public.motoristas_ativos
  ADD COLUMN IF NOT EXISTS caucao_valor numeric(10,2) NULL,
  ADD COLUMN IF NOT EXISTS lead_id uuid NULL REFERENCES public.leads_dasprent(id) ON DELETE SET NULL;
