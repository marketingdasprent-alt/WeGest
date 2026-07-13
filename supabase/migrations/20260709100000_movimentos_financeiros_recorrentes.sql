-- ============================================================
-- Motor genérico de lançamentos financeiros recorrentes (motorista)
-- ============================================================
-- Substitui dois mecanismos avulsos, sem recorrência real:
--   1. motoristas_ativos.seguro_valor_semanal + cron gerar_seguros_semanais
--      (só seguro, só semanal, configurado na ficha do motorista)
--   2. separador "Outros Custos" (motorista_custos_adicionais), que gera
--      de uma vez um lote fixo de N semanas — sem recorrência contínua
--
-- Agora: qualquer débito/crédito no separador Financeiro pode ser marcado
-- como recorrente — semanal, ou mensal (numa semana fixa do mês, ex.:
-- sempre a 2ª semana). A âncora é sempre escolhida por semana (segunda-
-- feira), como o resto da faturação semanal da app.
--
-- Modelo copiado do seguro semanal / slot mensal / cobranças TVDE.
-- Idempotente e aditiva (segura para correr em produção):
--   - NÃO apaga motoristas_ativos.seguro_valor_semanal nem
--     motorista_custos_adicionais — ficam como histórico, só deixam de
--     ser escritos por código novo.
--   - NÃO gera retroativamente a semana corrente para os seguros
--     migrados (evita duplicar um débito que o cron antigo já possa ter
--     lançado esta semana) — a 1ª ocorrência do motor novo é sempre a
--     PRÓXIMA semana. Se esta migração for aplicada antes do cron antigo
--     correr (2ª feira 06:00 UTC) numa semana em que ainda não gerou o
--     seguro, essa semana específica fica por gerar — confirmar à mão.
-- ============================================================

-- 1. Tabela de regras de recorrência ------------------------------------------
CREATE TABLE IF NOT EXISTS public.motorista_financeiro_recorrencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL DEFAULT public.get_current_org_id() REFERENCES public.organizacoes(id),
  motorista_id uuid NOT NULL REFERENCES public.motoristas_ativos(id),
  tipo text NOT NULL CHECK (tipo IN ('credito', 'debito')),
  categoria text,
  descricao text NOT NULL,
  valor numeric NOT NULL CHECK (valor > 0),
  frequencia text NOT NULL CHECK (frequencia IN ('semanal', 'mensal')),
  semana_ancora date NOT NULL,
  data_fim date,
  max_ocorrencias integer CHECK (max_ocorrencias IS NULL OR max_ocorrencias > 0),
  ocorrencias_geradas integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'pausada', 'cancelada', 'concluida')),
  referencia_base text,
  criado_por uuid DEFAULT auth.uid() REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.motorista_financeiro_recorrencias IS
  'Regras de lançamento recorrente (semanal ou mensal) no financeiro do motorista. O cron gerar_movimentos_recorrentes lê estas regras e cria as linhas em motorista_financeiro.';
COMMENT ON COLUMN public.motorista_financeiro_recorrencias.semana_ancora IS
  'Segunda-feira da 1ª semana. Para frequência mensal, determina a semana do mês (1ª..5ª) em que repete todos os meses; meses sem essa semana (ex.: 5ª) não geram ocorrência.';
COMMENT ON COLUMN public.motorista_financeiro_recorrencias.status IS
  'ativa = gera normalmente; pausada = suspensa manualmente; cancelada = terminada manualmente; concluida = atingiu max_ocorrencias ou data_fim.';

CREATE INDEX IF NOT EXISTS idx_motorista_financeiro_recorrencias_motorista
  ON public.motorista_financeiro_recorrencias(motorista_id);
CREATE INDEX IF NOT EXISTS idx_motorista_financeiro_recorrencias_ativas
  ON public.motorista_financeiro_recorrencias(status) WHERE status = 'ativa';

ALTER TABLE public.motorista_financeiro_recorrencias ENABLE ROW LEVEL SECURITY;

-- Mesma regra de acesso de motorista_financeiro (20260513100005).
DROP POLICY IF EXISTS "mfr_select" ON public.motorista_financeiro_recorrencias;
CREATE POLICY "mfr_select" ON public.motorista_financeiro_recorrencias FOR SELECT TO authenticated
  USING (org_id = public.get_current_org_id() AND (
    public.is_current_user_admin()
    OR public.has_permission(auth.uid(), 'motoristas_gestao')
    OR public.has_permission(auth.uid(), 'assistencia_tickets')
  ));

DROP POLICY IF EXISTS "mfr_insert" ON public.motorista_financeiro_recorrencias;
CREATE POLICY "mfr_insert" ON public.motorista_financeiro_recorrencias FOR INSERT TO authenticated
  WITH CHECK (org_id = public.get_current_org_id() AND (
    public.is_current_user_admin()
    OR public.has_permission(auth.uid(), 'motoristas_gestao')
    OR public.has_permission(auth.uid(), 'assistencia_tickets')
  ));

DROP POLICY IF EXISTS "mfr_update" ON public.motorista_financeiro_recorrencias;
CREATE POLICY "mfr_update" ON public.motorista_financeiro_recorrencias FOR UPDATE TO authenticated
  USING (org_id = public.get_current_org_id() AND (
    public.is_current_user_admin()
    OR public.has_permission(auth.uid(), 'motoristas_gestao')
    OR public.has_permission(auth.uid(), 'assistencia_tickets')
  ));

-- 2. Ligação da linha gerada de volta à regra que a criou ----------------------
ALTER TABLE public.motorista_financeiro
  ADD COLUMN IF NOT EXISTS recorrencia_id uuid REFERENCES public.motorista_financeiro_recorrencias(id);

COMMENT ON COLUMN public.motorista_financeiro.recorrencia_id IS
  'Preenchido quando a linha foi gerada por uma regra de motorista_financeiro_recorrencias (manual ou via cron gerar_movimentos_recorrentes). NULL para lançamentos avulsos.';

-- Anti-duplicação: uma linha por (regra, semana) — usada pelo cron E pelo
-- INSERT imediato da 1ª ocorrência feito pelo frontend ao criar a regra.
CREATE UNIQUE INDEX IF NOT EXISTS motorista_financeiro_recorrencia_periodo_unico
  ON public.motorista_financeiro (recorrencia_id, data_movimento)
  WHERE recorrencia_id IS NOT NULL;

-- 3. Função idempotente: gera os lançamentos da semana alvo --------------------
--    Semana = segunda a domingo (ISO). Por defeito gera a semana corrente;
--    p_semanas_a_frente permite pré-gerar semanas futuras.
CREATE OR REPLACE FUNCTION public.gerar_movimentos_recorrentes(
  p_semanas_a_frente integer DEFAULT 0
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec               record;
  v_semana_ref        date;
  v_semana_do_mes     integer;
  v_primeira_segunda  date;
  v_alvo              date;
  v_deve_gerar        boolean;
  v_criadas           integer := 0;
  v_rowcount          integer;
BEGIN
  v_semana_ref := (date_trunc('week', current_date) + (GREATEST(p_semanas_a_frente, 0) || ' weeks')::interval)::date;

  FOR v_rec IN
    SELECT *
    FROM public.motorista_financeiro_recorrencias r
    WHERE r.status = 'ativa'
      AND r.semana_ancora <= v_semana_ref
      AND (r.data_fim IS NULL OR v_semana_ref <= r.data_fim)
      AND (r.max_ocorrencias IS NULL OR r.ocorrencias_geradas < r.max_ocorrencias)
  LOOP
    v_deve_gerar := false;

    IF v_rec.frequencia = 'semanal' THEN
      v_deve_gerar := true;
    ELSE
      -- Mensal: repete sempre na mesma "semana-do-mês" da âncora (1ª..5ª,
      -- pelo dia-do-mês da âncora / 7 arredondado para cima). Se o mês
      -- alvo não tiver essa semana (ex.: âncora na 5ª semana e o mês só
      -- tem 4 segundas-feiras), não gera nada nesse mês.
      v_semana_do_mes := ceil(extract(day FROM v_rec.semana_ancora) / 7.0)::integer;
      v_primeira_segunda := (date_trunc('month', v_semana_ref)::date)
        + ((8 - extract(isodow FROM date_trunc('month', v_semana_ref)::date)::integer) % 7);
      v_alvo := v_primeira_segunda + ((v_semana_do_mes - 1) * 7);
      v_deve_gerar := (v_alvo = v_semana_ref) AND (extract(month FROM v_alvo) = extract(month FROM v_semana_ref));
    END IF;

    CONTINUE WHEN NOT v_deve_gerar;

    INSERT INTO public.motorista_financeiro (
      motorista_id, org_id, tipo, categoria, descricao, valor,
      data_movimento, status, referencia, recorrencia_id
    )
    VALUES (
      v_rec.motorista_id,
      v_rec.org_id,
      v_rec.tipo,
      v_rec.categoria,
      v_rec.descricao,
      v_rec.valor,
      v_semana_ref,
      'pendente',
      v_rec.referencia_base,
      v_rec.id
    )
    ON CONFLICT (recorrencia_id, data_movimento) WHERE recorrencia_id IS NOT NULL
    DO NOTHING;

    GET DIAGNOSTICS v_rowcount = ROW_COUNT;
    IF v_rowcount > 0 THEN
      v_criadas := v_criadas + 1;
      UPDATE public.motorista_financeiro_recorrencias
      SET ocorrencias_geradas = ocorrencias_geradas + 1,
          status = CASE
            WHEN max_ocorrencias IS NOT NULL AND ocorrencias_geradas + 1 >= max_ocorrencias THEN 'concluida'
            ELSE status
          END,
          updated_at = now()
      WHERE id = v_rec.id;
    END IF;
  END LOOP;

  RETURN v_criadas;
END;
$$;

COMMENT ON FUNCTION public.gerar_movimentos_recorrentes(integer) IS
  'Gera os lançamentos (débito/crédito) da semana alvo para cada regra ativa em motorista_financeiro_recorrencias — semanal sempre, mensal só na semana-do-mês da âncora. Idempotente por (recorrencia_id, data_movimento). Devolve o nº de linhas criadas.';

GRANT EXECUTE ON FUNCTION public.gerar_movimentos_recorrentes(integer) TO service_role;

-- 4. Cron semanal: 2ª feira às 06:00 UTC (idempotente) -------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gerar-movimentos-recorrentes') THEN
    PERFORM cron.unschedule('gerar-movimentos-recorrentes');
  END IF;
  PERFORM cron.schedule(
    'gerar-movimentos-recorrentes',
    '0 6 * * 1',
    $cron$ SELECT public.gerar_movimentos_recorrentes(0); $cron$
  );
END $$;

-- 5. Retirar o cron antigo do seguro semanal — substituído pelo motor novo -----
--    (a função gerar_seguros_semanais fica definida, só deixa de ser chamada)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'gerar-seguros-semanais') THEN
    PERFORM cron.unschedule('gerar-seguros-semanais');
  END IF;
END $$;

-- 6. Migrar configurações existentes de seguro semanal para o motor novo -------
--    1ª ocorrência = PRÓXIMA semana (não a corrente — ver aviso no topo).
--    motoristas_ativos.seguro_valor_semanal fica na BD como histórico.
INSERT INTO public.motorista_financeiro_recorrencias (
  org_id, motorista_id, tipo, categoria, descricao, valor, frequencia, semana_ancora, status
)
SELECT
  m.org_id,
  m.id,
  'debito',
  'seguros',
  'Seguro semanal',
  m.seguro_valor_semanal,
  'semanal',
  (date_trunc('week', current_date) + interval '1 week')::date,
  'ativa'
FROM public.motoristas_ativos m
WHERE m.status_ativo = true
  AND m.seguro_valor_semanal IS NOT NULL
  AND m.seguro_valor_semanal > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.motorista_financeiro_recorrencias r
    WHERE r.motorista_id = m.id AND r.categoria = 'seguros' AND r.frequencia = 'semanal' AND r.status = 'ativa'
  );
