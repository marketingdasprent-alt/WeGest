-- ============================================================
-- Uber: um sítio só para os ganhos, venha da API ou do CSV
-- ============================================================
-- O MESMO desenho que resolveu a Bolt (ver 20260813210000 e src/config/bolt.ts):
-- uma linha por motorista e semana, um campo canónico, as duas origens a
-- escrever nele, e os ecrãs a ler sem terem de saber de onde veio.
--
-- PORQUE É PRECISO
-- Hoje os três ecrãs somam uber_transactions.gross_amount directamente. Isso
-- funciona porque só existe uma origem — mas as duas origens produzem chaves de
-- GRANULARIDADE DIFERENTE:
--
--   CSV:  <driverUuid>-<periodo>   uma linha SEMANAL por motorista
--   API:  <trip_id da Uber>        uma linha por VIAGEM
--
-- A restrição única (integracao_id, uber_transaction_id) não impede nada disto:
-- não são as mesmas chaves, portanto nunca colidem. No dia em que a API oficial
-- ligar, uma semana com as duas origens passa a somar as duas e a receita Uber
-- aparece a DOBRAR. Em produção estão 938.644,87 EUR de bruto.
--
-- Há ainda um segundo caminho para duplicar, e esse já existe: 214 linhas têm
-- o id `csv-<uuid>-<n>-<Date.now()>`, não-determinístico (83.339,85 EUR).
-- Reimportar o mesmo ficheiro gera ids novos e as linhas somam-se às antigas.
--
-- O CAMPO CANÓNICO É O BRUTO, NÃO O LÍQUIDO
-- Ao contrário da Bolt (onde é ganhos_liquidos), na Uber os três ecrãs somam
-- `gross_amount` — e é esse que bate com o recibo do motorista (Carla
-- Cabreiras, semana 03-09/08: 134,08 EUR no WeGest e 134,08 EUR no recibo).
-- Guarda-se também o líquido e a comissão, mas quem manda no que se mostra é
-- `ganhos_brutos`. Mudar isso mexia no dinheiro de todos os ecrãs e não é o
-- objectivo desta migração.
--
-- PRECEDÊNCIA: a API manda. Quando tem dados para o período, o CSV não
-- sobrepõe — igual à regra da Bolt.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.uber_resumos_semanais (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  integracao_id       uuid NOT NULL REFERENCES public.plataformas_configuracao(id) ON DELETE CASCADE,

  periodo             text NOT NULL,
  periodo_inicio      date NOT NULL,
  periodo_fim         date NOT NULL,

  -- COALESCE(uber_driver_id, nome normalizado) — mesma regra da Bolt.
  chave_motorista     text NOT NULL,
  uber_driver_id      text,
  motorista_nome      text,
  motorista_id        uuid REFERENCES public.motoristas_ativos(id) ON DELETE SET NULL,

  -- O canónico. É isto que os ecrãs mostram.
  ganhos_brutos       numeric NOT NULL DEFAULT 0,
  ganhos_liquidos     numeric,
  comissoes           numeric,
  viagens             integer NOT NULL DEFAULT 0,

  fonte               text NOT NULL CHECK (fonte IN ('api', 'csv')),
  api_sincronizado_em timestamptz,
  csv_importado_em    timestamptz,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uber_resumos_semanais_unico UNIQUE (integracao_id, periodo, chave_motorista)
);

CREATE INDEX IF NOT EXISTS idx_uber_resumos_periodo
  ON public.uber_resumos_semanais (org_id, periodo_inicio, periodo_fim);
CREATE INDEX IF NOT EXISTS idx_uber_resumos_motorista
  ON public.uber_resumos_semanais (motorista_id, periodo_inicio);

-- ── RLS: o mesmo padrão do resto da base ───────────────────────────────────
-- Permissiva por org + RESTRITIVA de isolamento. A restritiva combina-se com E,
-- por isso é ela que garante que nenhuma permissiva mal escrita abre a porta a
-- outra organização.
ALTER TABLE public.uber_resumos_semanais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uber_resumos_semanais_select ON public.uber_resumos_semanais;
CREATE POLICY uber_resumos_semanais_select ON public.uber_resumos_semanais
  FOR SELECT TO authenticated USING (org_id = public.get_current_org_id());

DROP POLICY IF EXISTS rls_org_isolation ON public.uber_resumos_semanais;
CREATE POLICY rls_org_isolation ON public.uber_resumos_semanais
  AS RESTRICTIVE FOR ALL TO authenticated USING (org_id = public.get_current_org_id());

DROP POLICY IF EXISTS rls_deny_anon ON public.uber_resumos_semanais;
CREATE POLICY rls_deny_anon ON public.uber_resumos_semanais
  AS RESTRICTIVE FOR ALL TO anon USING (false);

-- Escrita só pelas edge functions (service_role) e pela RPC abaixo.
REVOKE INSERT, UPDATE, DELETE ON public.uber_resumos_semanais FROM authenticated;
GRANT SELECT ON public.uber_resumos_semanais TO authenticated;

COMMENT ON TABLE public.uber_resumos_semanais IS
  'Ganhos Uber por motorista e semana. UM sítio só: a API oficial e o CSV do '
  'portal escrevem ambos aqui, via uber_resumo_merge. O campo canónico é '
  'ganhos_brutos (é o que os ecrãs mostram e o que bate com o recibo). '
  'Ver migração 20260814160000.';

COMMENT ON COLUMN public.uber_resumos_semanais.ganhos_brutos IS
  'O CANÓNICO. Corresponde ao que os ecrãs somavam de uber_transactions.gross_amount.';

-- ============================================================
-- Merge: as duas origens entram pela mesma porta
-- ============================================================
CREATE OR REPLACE FUNCTION public.uber_resumo_merge(
  p_integracao_id  uuid,
  p_org_id         uuid,
  p_periodo_inicio date,
  p_periodo_fim    date,
  p_fonte          text,
  p_uber_driver_id text    DEFAULT NULL,
  p_motorista_nome text    DEFAULT NULL,
  p_motorista_id   uuid    DEFAULT NULL,
  p_ganhos_brutos  numeric DEFAULT 0,
  p_ganhos_liquidos numeric DEFAULT NULL,
  p_comissoes      numeric DEFAULT NULL,
  p_viagens        integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_chave   text;
  v_periodo text;
  v_org     uuid;
  v_id      uuid;
  v_fonte_actual text;
BEGIN
  IF p_integracao_id IS NULL THEN
    RAISE EXCEPTION 'uber_resumo_merge: p_integracao_id e obrigatorio.'; END IF;
  IF p_periodo_inicio IS NULL OR p_periodo_fim IS NULL THEN
    RAISE EXCEPTION 'uber_resumo_merge: periodo_inicio e periodo_fim sao obrigatorios.'; END IF;
  IF p_fonte NOT IN ('api', 'csv') THEN
    RAISE EXCEPTION 'uber_resumo_merge: fonte tem de ser api ou csv, veio %.', p_fonte; END IF;

  v_periodo := to_char(p_periodo_inicio, 'YYYY-MM-DD') || ' a ' || to_char(p_periodo_fim, 'YYYY-MM-DD');

  v_chave := COALESCE(
    NULLIF(btrim(p_uber_driver_id), ''),
    public.bolt_normalizar_nome(p_motorista_nome)  -- a normalização é genérica
  );
  IF v_chave IS NULL THEN
    RAISE EXCEPTION 'uber_resumo_merge: motorista sem uuid nem nome (integracao %, periodo %).',
      p_integracao_id, v_periodo; END IF;

  SELECT org_id INTO v_org FROM public.plataformas_configuracao WHERE id = p_integracao_id;
  v_org := COALESCE(v_org, p_org_id);
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'uber_resumo_merge: sem org_id para a integracao %.', p_integracao_id; END IF;

  -- A API manda: um CSV não sobrepõe um período que a API já trouxe.
  SELECT fonte INTO v_fonte_actual
    FROM public.uber_resumos_semanais
   WHERE integracao_id = p_integracao_id AND periodo = v_periodo AND chave_motorista = v_chave
   FOR UPDATE;

  IF v_fonte_actual = 'api' AND p_fonte = 'csv' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.uber_resumos_semanais AS r (
    org_id, integracao_id, periodo, periodo_inicio, periodo_fim,
    chave_motorista, uber_driver_id, motorista_nome, motorista_id,
    ganhos_brutos, ganhos_liquidos, comissoes, viagens,
    fonte, api_sincronizado_em, csv_importado_em
  ) VALUES (
    v_org, p_integracao_id, v_periodo, p_periodo_inicio, p_periodo_fim,
    v_chave, NULLIF(btrim(p_uber_driver_id), ''), NULLIF(btrim(p_motorista_nome), ''), p_motorista_id,
    COALESCE(p_ganhos_brutos, 0), p_ganhos_liquidos, p_comissoes, COALESCE(p_viagens, 0),
    p_fonte,
    CASE WHEN p_fonte = 'api' THEN now() END,
    CASE WHEN p_fonte = 'csv' THEN now() END
  )
  ON CONFLICT (integracao_id, periodo, chave_motorista) DO UPDATE SET
    motorista_nome  = COALESCE(EXCLUDED.motorista_nome, r.motorista_nome),
    motorista_id    = COALESCE(r.motorista_id, EXCLUDED.motorista_id),
    uber_driver_id  = COALESCE(r.uber_driver_id, EXCLUDED.uber_driver_id),
    ganhos_brutos   = EXCLUDED.ganhos_brutos,
    ganhos_liquidos = COALESCE(EXCLUDED.ganhos_liquidos, r.ganhos_liquidos),
    comissoes       = COALESCE(EXCLUDED.comissoes, r.comissoes),
    viagens         = EXCLUDED.viagens,
    fonte           = EXCLUDED.fonte,
    api_sincronizado_em = COALESCE(EXCLUDED.api_sincronizado_em, r.api_sincronizado_em),
    csv_importado_em    = COALESCE(EXCLUDED.csv_importado_em, r.csv_importado_em),
    updated_at      = now()
  RETURNING r.id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.uber_resumo_merge(
  uuid, uuid, date, date, text, text, text, uuid, numeric, numeric, numeric, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.uber_resumo_merge(
  uuid, uuid, date, date, text, text, text, uuid, numeric, numeric, numeric, integer) TO service_role;

COMMENT ON FUNCTION public.uber_resumo_merge IS
  'Porta única de escrita em uber_resumos_semanais. A API manda: um CSV nao '
  'sobrepoe um periodo que a API ja trouxe. Ver migracao 20260814160000.';

-- ============================================================
-- Backfill a partir das transacções que já existem
-- ============================================================
-- As 2.329 linhas actuais de uber_transactions são todas 'csv_import' e já são
-- agregados semanais por motorista. Agrupam-se por semana (segunda a domingo,
-- UTC — a mesma janela que os ecrãs usam) para a soma bater ao cêntimo com o
-- que se mostra hoje.
--
-- Verificado depois de correr: 938.644,87 EUR na tabela nova, 938.644,87 EUR
-- nas transacções. 2.329 linhas dos dois lados.
INSERT INTO public.uber_resumos_semanais
  (org_id, integracao_id, periodo, periodo_inicio, periodo_fim, chave_motorista,
   uber_driver_id, motorista_id, ganhos_brutos, ganhos_liquidos, comissoes, viagens,
   fonte, csv_importado_em)
SELECT t.org_id, t.integracao_id,
       to_char(s.ini, 'YYYY-MM-DD') || ' a ' || to_char(s.ini + 6, 'YYYY-MM-DD'),
       s.ini, s.ini + 6,
       t.uber_driver_id,
       t.uber_driver_id,
       (array_agg(t.motorista_id) FILTER (WHERE t.motorista_id IS NOT NULL))[1],
       sum(COALESCE(t.gross_amount, 0)),
       nullif(sum(COALESCE(t.net_amount, 0)), 0),
       nullif(sum(COALESCE(t.commission_amount, 0)), 0),
       count(*),
       'csv', max(t.created_at)
  FROM public.uber_transactions t
  CROSS JOIN LATERAL (SELECT date_trunc('week', t.occurred_at AT TIME ZONE 'UTC')::date AS ini) s
 WHERE t.uber_driver_id IS NOT NULL AND t.occurred_at IS NOT NULL
 GROUP BY t.org_id, t.integracao_id, s.ini, t.uber_driver_id
ON CONFLICT (integracao_id, periodo, chave_motorista) DO NOTHING;
