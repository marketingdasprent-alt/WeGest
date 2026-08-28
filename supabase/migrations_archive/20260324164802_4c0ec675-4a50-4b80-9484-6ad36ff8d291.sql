
-- 1. Add robot_target_platform column
ALTER TABLE public.plataformas_configuracao 
ADD COLUMN IF NOT EXISTS robot_target_platform text;

-- 2. Create bolt_resumos_semanais table
CREATE TABLE IF NOT EXISTS public.bolt_resumos_semanais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao_id uuid REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE NOT NULL,
  motorista_id uuid REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL,
  periodo text NOT NULL,
  motorista_nome text,
  email text,
  telefone text,
  ganhos_brutos_total numeric DEFAULT 0,
  ganhos_brutos_app numeric DEFAULT 0,
  iva_ganhos_app numeric DEFAULT 0,
  ganhos_brutos_dinheiro numeric DEFAULT 0,
  iva_ganhos_dinheiro numeric DEFAULT 0,
  dinheiro_recebido numeric DEFAULT 0,
  gorjetas numeric DEFAULT 0,
  ganhos_campanha numeric DEFAULT 0,
  reembolsos_despesas numeric DEFAULT 0,
  taxas_cancelamento numeric DEFAULT 0,
  iva_taxas_cancelamento numeric DEFAULT 0,
  portagens numeric DEFAULT 0,
  taxas_reserva numeric DEFAULT 0,
  iva_taxas_reserva numeric DEFAULT 0,
  total_taxas numeric DEFAULT 0,
  comissoes numeric DEFAULT 0,
  reembolsos_passageiros numeric DEFAULT 0,
  outras_taxas numeric DEFAULT 0,
  ganhos_liquidos numeric DEFAULT 0,
  pagamento_previsto numeric DEFAULT 0,
  ganhos_brutos_hora numeric DEFAULT 0,
  ganhos_liquidos_hora numeric DEFAULT 0,
  desconto_comissao_app numeric DEFAULT 0,
  desconto_comissao_dinheiro numeric DEFAULT 0,
  identificador_motorista text,
  identificador_individual text,
  nivel text,
  categorias_ativas text,
  viagens_dinheiro_ativadas text,
  pontuacao_motorista numeric DEFAULT 0,
  viagens_terminadas integer DEFAULT 0,
  taxa_aceitacao numeric DEFAULT 0,
  tempo_online_min numeric DEFAULT 0,
  utilizacao numeric DEFAULT 0,
  taxa_finalizacao_todas numeric DEFAULT 0,
  taxa_finalizacao_aceites numeric DEFAULT 0,
  distancia_media_km numeric DEFAULT 0,
  distancia_total_km numeric DEFAULT 0,
  classificacao_media numeric DEFAULT 0,
  raw_data jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(integracao_id, periodo, identificador_motorista)
);

-- 3. RLS
ALTER TABLE public.bolt_resumos_semanais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage bolt_resumos_semanais"
ON public.bolt_resumos_semanais
FOR ALL
TO authenticated
USING (public.is_current_user_admin())
WITH CHECK (public.is_current_user_admin());

-- 4. Index
CREATE INDEX IF NOT EXISTS idx_bolt_resumos_integracao_periodo 
ON public.bolt_resumos_semanais(integracao_id, periodo);
