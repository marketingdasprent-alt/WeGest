
-- Tabela de eventos do calendário
CREATE TABLE public.calendario_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  tipo text NOT NULL DEFAULT 'tarefa' CHECK (tipo IN ('tarefa', 'reuniao', 'afazer', 'outro')),
  data_inicio timestamptz NOT NULL,
  data_fim timestamptz,
  dia_todo boolean NOT NULL DEFAULT false,
  criado_por uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lembrete_enviado_vespera boolean NOT NULL DEFAULT false,
  lembrete_enviado_dia boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tabela de configuração de email CC por utilizador
CREATE TABLE public.calendario_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email_cc text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_calendario_eventos_data_inicio ON public.calendario_eventos(data_inicio);
CREATE INDEX idx_calendario_eventos_criado_por ON public.calendario_eventos(criado_por);

-- Enable RLS
ALTER TABLE public.calendario_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendario_config ENABLE ROW LEVEL SECURITY;

-- RLS: Todos os autenticados podem ver todos os eventos
CREATE POLICY "Authenticated users can view all events"
  ON public.calendario_eventos FOR SELECT
  TO authenticated
  USING (true);

-- RLS: Apenas o criador pode criar eventos (com o seu user_id)
CREATE POLICY "Users can create their own events"
  ON public.calendario_eventos FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = criado_por);

-- RLS: Apenas o criador pode editar os seus eventos
CREATE POLICY "Users can update their own events"
  ON public.calendario_eventos FOR UPDATE
  TO authenticated
  USING (auth.uid() = criado_por);

-- RLS: Apenas o criador pode eliminar os seus eventos
CREATE POLICY "Users can delete their own events"
  ON public.calendario_eventos FOR DELETE
  TO authenticated
  USING (auth.uid() = criado_por);

-- RLS: Cada utilizador vê apenas a sua config
CREATE POLICY "Users can view their own config"
  ON public.calendario_config FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS: Cada utilizador pode criar a sua config
CREATE POLICY "Users can create their own config"
  ON public.calendario_config FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- RLS: Cada utilizador pode actualizar a sua config
CREATE POLICY "Users can update their own config"
  ON public.calendario_config FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_calendario_eventos_updated_at
  BEFORE UPDATE ON public.calendario_eventos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Service role policy para a edge function de lembretes poder actualizar flags
CREATE POLICY "Service role can update reminder flags"
  ON public.calendario_eventos FOR UPDATE
  TO service_role
  USING (true);

CREATE POLICY "Service role can select events"
  ON public.calendario_eventos FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can select config"
  ON public.calendario_config FOR SELECT
  TO service_role
  USING (true);
