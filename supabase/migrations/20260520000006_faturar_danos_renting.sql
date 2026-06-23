-- ============================================================
-- M6 — Faturação de danos ao condutor (Renting)
-- ============================================================
-- A tabela `viatura_danos` já existe, mas liga ao sistema antigo
-- (motoristas_ativos / contratos de prestação). Aqui ligamo-la
-- ao mundo Renting e geramos a cobrança ao condutor responsável.
--
-- Decisão de negócio: o dano entra como uma LINHA de
-- `contrato_cobrancas` (destinatário = condutor, com fatura
-- fiscal). Reaproveita o pipeline de faturação e o lançamento
-- automático na conta-corrente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Ligar viatura_danos ao Renting
-- ------------------------------------------------------------
ALTER TABLE public.viatura_danos
  ADD COLUMN IF NOT EXISTS contrato_renting_id uuid
    REFERENCES public.contratos_renting(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS condutor_cliente_id uuid
    REFERENCES public.clientes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cobranca_id uuid
    REFERENCES public.contrato_cobrancas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_viatura_danos_contrato_renting
  ON public.viatura_danos (contrato_renting_id) WHERE contrato_renting_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_viatura_danos_condutor
  ON public.viatura_danos (condutor_cliente_id) WHERE condutor_cliente_id IS NOT NULL;

COMMENT ON COLUMN public.viatura_danos.contrato_renting_id IS
  'Contrato renting em que o dano ocorreu.';
COMMENT ON COLUMN public.viatura_danos.condutor_cliente_id IS
  'Condutor responsável pelo dano — a quem o dano é faturado.';
COMMENT ON COLUMN public.viatura_danos.cobranca_id IS
  'Linha de contrato_cobrancas gerada para faturar este dano. NULL = ainda não faturado.';

-- ------------------------------------------------------------
-- 2. RPC: gerar a cobrança do dano (linha ao condutor, fiscal)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gerar_cobranca_dano(p_dano_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_dano        record;
  v_condutor    record;
  v_data        date;
  v_cobranca_id uuid;
BEGIN
  SELECT * INTO v_dano FROM public.viatura_danos WHERE id = p_dano_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dano % não encontrado.', p_dano_id;
  END IF;

  IF v_dano.cobranca_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este dano já tem cobrança gerada.';
  END IF;
  IF v_dano.contrato_renting_id IS NULL OR v_dano.condutor_cliente_id IS NULL THEN
    RAISE EXCEPTION 'Dano sem contrato renting ou condutor responsável definido.';
  END IF;
  IF COALESCE(v_dano.valor, 0) <= 0 THEN
    RAISE EXCEPTION 'Dano sem valor a imputar — defina o valor antes de faturar.';
  END IF;

  SELECT * INTO v_condutor FROM public.clientes WHERE id = v_dano.condutor_cliente_id;
  v_data := COALESCE(v_dano.data_ocorrencia, v_dano.data_registo, current_date);

  -- org_id é preenchido pelo trigger de contrato_cobrancas a partir do contrato
  INSERT INTO public.contrato_cobrancas (
    contrato_id, periodo_de, periodo_ate, descricao,
    destinatario_id, destinatario_papel, destinatario_nome,
    valor_sem_iva, taxa_iva, emite_fatura_fiscal, estado
  )
  VALUES (
    v_dano.contrato_renting_id, v_data, v_data,
    'Dano: ' || left(v_dano.descricao, 200),
    v_dano.condutor_cliente_id, 'condutor', v_condutor.nome,
    v_dano.valor, 23, true, 'pendente'
  )
  RETURNING id INTO v_cobranca_id;

  UPDATE public.viatura_danos
     SET cobranca_id = v_cobranca_id,
         updated_at  = now()
   WHERE id = p_dano_id;

  RETURN v_cobranca_id;
END;
$$;

COMMENT ON FUNCTION public.gerar_cobranca_dano(uuid) IS
  'Gera a linha de contrato_cobrancas para faturar um dano ao condutor responsável. '
  'A cobrança nasce pendente; é emitida pelo fluxo normal de faturação.';

GRANT EXECUTE ON FUNCTION public.gerar_cobranca_dano(uuid) TO authenticated;
