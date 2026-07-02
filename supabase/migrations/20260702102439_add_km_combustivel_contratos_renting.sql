-- ============================================================
-- Fix: folha de danos de Recolha (renting) sai com KM/Combustível
-- de Saída em branco.
-- ============================================================
-- Causa: contratos_renting nunca persistia o km/combustível
-- introduzidos na Entrega — RealizarEntregaPage.tsx só os passava
-- directo ao gerador de PDF nesse momento, sem gravar na BD. Na
-- Recolha (dias/semanas depois) não há de onde os ler.
--
-- Fix: 4 colunas novas + RealizarEntregaPage.tsx passa a gravá-las
-- ao confirmar Entrega/Recolha, e a ler km_saida/combustivel_saida
-- ao gerar a folha de danos da Recolha.
--
-- Deploy: aplicar à mão no SQL editor (CI não faz db push).
-- ============================================================

ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS km_saida integer,
  ADD COLUMN IF NOT EXISTS km_entrada integer,
  ADD COLUMN IF NOT EXISTS combustivel_saida text,
  ADD COLUMN IF NOT EXISTS combustivel_entrada text;
