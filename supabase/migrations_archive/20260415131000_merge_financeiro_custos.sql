
-- Adicionar colunas necessárias para fusão de financeiro e outros custos
ALTER TABLE public.motorista_financeiro 
ADD COLUMN IF NOT EXISTS fatura_url TEXT,
ADD COLUMN IF NOT EXISTS reparacao_id UUID REFERENCES public.viatura_reparacoes(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS acordo_pendente BOOLEAN DEFAULT false;

-- Comentários para documentação
COMMENT ON COLUMN public.motorista_financeiro.fatura_url IS 'URL do anexo do movimento (fatura/comprovativo)';
COMMENT ON COLUMN public.motorista_financeiro.reparacao_id IS 'Associação a uma reparação física de viatura';
COMMENT ON COLUMN public.motorista_financeiro.acordo_pendente IS 'Se o valor da reparação ainda aguarda acordo de parcelamento';

-- Criar bucket para faturas se não existir
INSERT INTO storage.buckets (id, name, public) 
VALUES ('financeiro-faturas', 'financeiro-faturas', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage
CREATE POLICY "Permissão para ver faturas financeiras" ON storage.objects
  FOR SELECT USING (bucket_id = 'financeiro-faturas' AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));

CREATE POLICY "Permissão para upload faturas financeiras" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'financeiro-faturas' AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));
