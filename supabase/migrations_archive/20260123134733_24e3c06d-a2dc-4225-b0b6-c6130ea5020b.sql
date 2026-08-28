-- Criar tabela para recibos dos motoristas
CREATE TABLE public.motorista_recibos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  motorista_id UUID NOT NULL REFERENCES public.motoristas_ativos(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  descricao TEXT NOT NULL,
  periodo_referencia TEXT,
  plataforma TEXT,
  valor_total DECIMAL(10,2),
  ficheiro_url TEXT NOT NULL,
  nome_ficheiro TEXT,
  status TEXT DEFAULT 'submetido',
  validado_por UUID REFERENCES auth.users(id),
  data_validacao TIMESTAMPTZ,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.motorista_recibos ENABLE ROW LEVEL SECURITY;

-- Políticas para gestores verem recibos
CREATE POLICY "Permissão para ver motorista_recibos"
ON public.motorista_recibos
FOR SELECT
USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

-- Políticas para gestores editarem (validar/rejeitar)
CREATE POLICY "Permissão para editar motorista_recibos"
ON public.motorista_recibos
FOR UPDATE
USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao'));

-- Políticas para motoristas criarem os seus recibos
CREATE POLICY "Motoristas podem criar seus recibos"
ON public.motorista_recibos
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Motoristas podem ver seus próprios recibos
CREATE POLICY "Motoristas podem ver seus recibos"
ON public.motorista_recibos
FOR SELECT
USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_motorista_recibos_updated_at
BEFORE UPDATE ON public.motorista_recibos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Criar bucket para recibos se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('motorista-recibos', 'motorista-recibos', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para recibos
CREATE POLICY "Motoristas podem fazer upload de recibos"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'motorista-recibos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Motoristas podem ver seus recibos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'motorista-recibos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Gestores podem ver todos os recibos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'motorista-recibos' AND (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas_gestao')));