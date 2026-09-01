-- ============================================================
-- A portagem segue o CONTRATO, não o palpite da importação
-- ============================================================
-- Como era: o via-verde-import olhava para a matrícula, perguntava "quem
-- conduz isto?" e carimbava o motorista_id na linha. Ficava congelado. Com o
-- motorista_viaturas corrompido, quatro passagens da BV-87-QO e da BT-21-UN
-- foram parar ao Adair Pinheiro, que nunca conduziu nenhuma delas.
--
-- Como passa a ser (regra do Thiago, 26/08/2026):
--
--   A importação grava dispositivo, matrícula e valor. Mais nada.
--   Na leitura, resolve-se: a matrícula estava alugada naquele dia? A quem?
--
--   · O valor fica SEMPRE ancorado ao CONTRATO, e o contrato tem cliente.
--   · Regime tvde ou slot -> quem paga é o CONDUTOR.
--   · Regime rent_a_car   -> quem paga é o CLIENTE, com possibilidade de
--                            imputar ao condutor na hora de lançar/facturar.
--
-- Nota sobre as datas: contratos_renting.data_inicio/data_fim não são de
-- confiança (há contratos `em_curso` com fim em 2025-12-01). A janela fiável
-- de uma versão é created_at -> substituido_em: nasce quando é criada, morre
-- quando outra a substitui. É essa que se usa para saber qual estava viva.
-- ============================================================

ALTER TABLE public.via_verde_transacoes
  ADD COLUMN IF NOT EXISTS contrato_id uuid REFERENCES public.contratos_renting(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cliente_id  uuid REFERENCES public.clientes(id)          ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS devedor_tipo text,
  -- Só para rent_a_car: decisão manual de imputar ao condutor em vez do
  -- cliente. Preenchida no lançamento/facturação, nunca pela importação.
  ADD COLUMN IF NOT EXISTS imputado_motorista_id uuid REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.via_verde_transacoes.contrato_id IS
  'Contrato que tinha esta viatura na data da passagem. A âncora do valor.';
COMMENT ON COLUMN public.via_verde_transacoes.devedor_tipo IS
  'motorista (tvde/slot) ou cliente (rent_a_car). Quem a conta espera cobrar.';
COMMENT ON COLUMN public.via_verde_transacoes.imputado_motorista_id IS
  'Rent-a-car: condutor a quem se decidiu imputar a portagem, em vez do cliente.';

CREATE INDEX IF NOT EXISTS via_verde_transacoes_contrato_idx
  ON public.via_verde_transacoes (contrato_id);
CREATE INDEX IF NOT EXISTS via_verde_transacoes_cliente_idx
  ON public.via_verde_transacoes (cliente_id);

-- ------------------------------------------------------------
-- Qual contrato tinha esta viatura naquele dia
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolver_contrato_da_viatura(
  p_viatura_id uuid,
  p_data       date
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM public.contratos_renting c
  WHERE c.viatura_id = p_viatura_id
    AND c.deleted_at IS NULL
    AND c.estado_operacional <> 'cancelado'
    AND (c.created_at AT TIME ZONE 'Europe/Lisbon')::date <= p_data
    AND (c.substituido_em IS NULL
         OR (c.substituido_em AT TIME ZONE 'Europe/Lisbon')::date > p_data)
  -- A viva mais recente à data. Desempate estável por id: sem ele o
  -- resultado depende da ordem que a base devolver.
  ORDER BY c.created_at DESC, c.id
  LIMIT 1;
$$;

-- ------------------------------------------------------------
-- Quem paga: condutor ou cliente, conforme o regime
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolver_devedor_da_viatura(
  p_viatura_id uuid,
  p_data       date,
  OUT contrato_id   uuid,
  OUT cliente_id    uuid,
  OUT motorista_id  uuid,
  OUT devedor_tipo  text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_regime public.contrato_regime_enum;
BEGIN
  contrato_id := public.resolver_contrato_da_viatura(p_viatura_id, p_data);

  IF contrato_id IS NOT NULL THEN
    SELECT c.cliente_id, c.regime INTO cliente_id, v_regime
    FROM public.contratos_renting c WHERE c.id = contrato_id;
  END IF;

  -- O condutor vem do histórico de atribuição, já corrigido e protegido
  -- contra sobreposições. Sem contrato, ainda assim se identifica quem
  -- conduzia — serve para investigar, mesmo que não haja a quem cobrar.
  motorista_id := public.resolver_motorista_por_viatura(p_viatura_id, p_data);

  devedor_tipo := CASE
    WHEN v_regime IN ('tvde', 'slot') THEN 'motorista'
    WHEN v_regime = 'rent_a_car'      THEN 'cliente'
    ELSE NULL
  END;
END $$;

REVOKE ALL ON FUNCTION public.resolver_contrato_da_viatura(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolver_devedor_da_viatura(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_contrato_da_viatura(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_devedor_da_viatura(uuid, date) TO authenticated;

-- ------------------------------------------------------------
-- O gatilho passa a preencher os quatro campos
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_resolver_motorista_viatura()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
BEGIN
  SELECT * INTO r FROM public.resolver_devedor_da_viatura(
    NEW.viatura_id, NEW.transaction_date::date
  );

  NEW.contrato_id  := r.contrato_id;
  NEW.cliente_id   := r.cliente_id;
  NEW.devedor_tipo := r.devedor_tipo;

  -- Mesma guarda de sempre: uma resolução vazia não apaga o que lá está,
  -- excepto quando a correcção do histórico o pede explicitamente.
  IF r.motorista_id IS NOT NULL OR TG_OP = 'INSERT' OR public.recalculo_e_forcado() THEN
    NEW.motorista_id := r.motorista_id;
  ELSE
    NEW.motorista_id := OLD.motorista_id;
  END IF;

  RETURN NEW;
END $$;

-- ------------------------------------------------------------
-- Preencher o que já está gravado
-- ------------------------------------------------------------
DO $$
BEGIN
  PERFORM set_config('wegest.recalculo_forcado', '1', true);
  UPDATE public.via_verde_transacoes SET motorista_id = motorista_id
   WHERE viatura_id IS NOT NULL;
  PERFORM set_config('wegest.recalculo_forcado', '0', true);
END $$;
