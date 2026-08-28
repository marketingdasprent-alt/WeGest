-- ============================================================
-- Atribuição de movimentos por DATAS, não pela importação
-- ============================================================
-- O QUE ESTAVA MAL
--
-- Quem é o dono de um movimento (combustível, portagem, ganhos) era decidido
-- no momento da IMPORTAÇÃO e congelado na linha. O importador olhava para o
-- cartão, via quem o tinha *nesse instante*, e gravava `motorista_id`.
--
-- Consequências, todas vistas na Década Ousada a 2026-08-25:
--
--   · O cartão Repsol 2160 foi devolvido pelo Aymen Mhamdi nesse dia. Os 400 €
--     de 18 a 21/08 continuaram atribuídos a ele — corrigir a ficha não mexe
--     no passado, porque o passado já está escrito.
--   · Pior: `repsol-import-csv` faz upsert com `onConflict:
--     integracao_id,transaction_id` e leva `motorista_id` no payload. Bastava
--     reimportar 12-24/08 depois de o cartão passar a outro motorista para os
--     400 € saltarem, em silêncio, para o motorista novo.
--   · O Bolt liga por `motoristas_ativos.bolt_id`, que é UM valor. Quando um
--     motorista muda de conta Bolt (operação normal nesta frota), a Bolt dá-lhe
--     um UUID novo, a ficha fica com o antigo, e o resumo da semana seguinte
--     cai órfão. Foram 23 resumos e 4 298,55 € na semana de 17-23/08.
--
-- O MODELO CORRECTO
--
-- A importação enche as tabelas em bruto e mais nada. Quem é o dono resolve-se
-- a partir do histórico: "quem tinha este cartão NAQUELE dia". Só o fecho de
-- contas grava o resultado no resumo do motorista.
--
-- Duas naturezas diferentes, duas tabelas:
--
--   · cartao_atribuicoes — um cartão passa de mão em mão. O dono depende da
--     DATA do movimento. Períodos sem sobreposição, garantido pela base.
--   · motorista_plataforma_identidades — um id da Bolt/Uber pertence a uma
--     pessoa e não é reutilizado por outra; o que falta é poder ter VÁRIOS por
--     motorista (um por frota). Aqui o problema é a cardinalidade, não a data.
--
-- E porque corrigir o passado pode mexer numa semana já fechada, fica também
-- um registo de refecho pendente — senão a correcção é silenciosa e o dinheiro
-- perde-se na mesma, só que mais tarde.
--
-- Idempotente e aditiva: correr duas vezes não faz nada da segunda vez, e não
-- apaga nem reescreve nada do que já existe.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ------------------------------------------------------------
-- 1) Histórico de atribuição de cartões
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cartao_atribuicoes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  cartao_id    uuid NOT NULL REFERENCES public.cartoes_frota(id) ON DELETE CASCADE,
  motorista_id uuid NOT NULL REFERENCES public.motoristas_ativos(id) ON DELETE RESTRICT,
  de           date NOT NULL,
  ate          date,
  origem       text NOT NULL DEFAULT 'manual',
  criado_por   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cartao_atribuicoes_periodo_valido CHECK (ate IS NULL OR ate >= de)
);

COMMENT ON TABLE public.cartao_atribuicoes IS
  'Quem teve cada cartão e entre que datas. Fonte de verdade para atribuir '
  'combustível — substitui o motorista_id que a importação congelava.';
COMMENT ON COLUMN public.cartao_atribuicoes.ate IS
  'NULL = ainda está com este motorista. Intervalo fechado dos dois lados.';

-- Um cartão não pode estar com duas pessoas ao mesmo tempo. Deixar isto ao
-- cuidado da interface é como já perdemos dinheiro antes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cartao_atribuicoes_sem_sobreposicao'
  ) THEN
    ALTER TABLE public.cartao_atribuicoes
      ADD CONSTRAINT cartao_atribuicoes_sem_sobreposicao
      EXCLUDE USING gist (
        cartao_id WITH =,
        daterange(de, COALESCE(ate, 'infinity'::date), '[]') WITH &&
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cartao_atribuicoes_cartao_idx
  ON public.cartao_atribuicoes (cartao_id, de DESC);
CREATE INDEX IF NOT EXISTS cartao_atribuicoes_motorista_idx
  ON public.cartao_atribuicoes (motorista_id, de DESC);

ALTER TABLE public.cartao_atribuicoes ENABLE ROW LEVEL SECURITY;

-- Mesma porta que a cartoes_frota (ver 20260722130000_fix_rls_permission_gaps).
DROP POLICY IF EXISTS cartao_atribuicoes_select ON public.cartao_atribuicoes;
CREATE POLICY cartao_atribuicoes_select ON public.cartao_atribuicoes
  FOR SELECT TO authenticated
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'administrativo_cartoes'));

DROP POLICY IF EXISTS cartao_atribuicoes_insert ON public.cartao_atribuicoes;
CREATE POLICY cartao_atribuicoes_insert ON public.cartao_atribuicoes
  FOR INSERT TO authenticated
  WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'administrativo_cartoes', 'editar'));

DROP POLICY IF EXISTS cartao_atribuicoes_update ON public.cartao_atribuicoes;
CREATE POLICY cartao_atribuicoes_update ON public.cartao_atribuicoes
  FOR UPDATE TO authenticated
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'administrativo_cartoes', 'editar'))
  WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'administrativo_cartoes', 'editar'));

DROP POLICY IF EXISTS cartao_atribuicoes_delete ON public.cartao_atribuicoes;
CREATE POLICY cartao_atribuicoes_delete ON public.cartao_atribuicoes
  FOR DELETE TO authenticated
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'administrativo_cartoes', 'editar'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cartao_atribuicoes TO authenticated;

-- Backfill do que a cartoes_frota sabe hoje. É pouco (um detentor actual e, no
-- máximo, um anterior), mas é o que há — e a partir daqui o histórico cresce a
-- sério. Sem data de entrega usa-se a criação do cartão.
INSERT INTO public.cartao_atribuicoes (org_id, cartao_id, motorista_id, de, ate, origem)
SELECT c.org_id, c.id, c.motorista_id,
       COALESCE(c.data_entrega, c.created_at::date),
       NULL,
       'backfill'
FROM public.cartoes_frota c
WHERE c.motorista_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.cartao_atribuicoes a
    WHERE a.cartao_id = c.id AND a.motorista_id = c.motorista_id AND a.ate IS NULL
  );

INSERT INTO public.cartao_atribuicoes (org_id, cartao_id, motorista_id, de, ate, origem)
SELECT c.org_id, c.id, c.ultimo_motorista_id,
       COALESCE(c.data_entrega, c.created_at::date),
       COALESCE(c.data_devolucao, CURRENT_DATE),
       'backfill'
FROM public.cartoes_frota c
WHERE c.motorista_id IS NULL
  AND c.ultimo_motorista_id IS NOT NULL
  AND COALESCE(c.data_devolucao, CURRENT_DATE) >= COALESCE(c.data_entrega, c.created_at::date)
  AND NOT EXISTS (
    SELECT 1 FROM public.cartao_atribuicoes a
    WHERE a.cartao_id = c.id AND a.motorista_id = c.ultimo_motorista_id
  );

-- ------------------------------------------------------------
-- 2) Identidades de plataforma (Bolt/Uber), várias por motorista
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.motorista_plataforma_identidades (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  motorista_id  uuid NOT NULL REFERENCES public.motoristas_ativos(id) ON DELETE CASCADE,
  plataforma    text NOT NULL CHECK (plataforma IN ('bolt', 'uber')),
  identificador text NOT NULL,
  integracao_id uuid REFERENCES public.plataformas_configuracao(id) ON DELETE SET NULL,
  origem        text NOT NULL DEFAULT 'manual',
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Dentro da organização, um id de plataforma é de uma pessoa só. Entre
  -- organizações não se cruza (ver 20260825100000_mapeamento_plataforma_nao_cruza_orgs).
  CONSTRAINT motorista_plataforma_identidades_unica
    UNIQUE (org_id, plataforma, identificador)
);

COMMENT ON TABLE public.motorista_plataforma_identidades IS
  'Os ids Bolt/Uber de cada motorista. A Bolt dá um UUID novo por frota, e a '
  'ficha só guardava um — por isso mudar de conta deixava o resumo órfão.';

CREATE INDEX IF NOT EXISTS mpi_motorista_idx
  ON public.motorista_plataforma_identidades (motorista_id, plataforma);
CREATE INDEX IF NOT EXISTS mpi_lookup_idx
  ON public.motorista_plataforma_identidades (org_id, plataforma, identificador);

ALTER TABLE public.motorista_plataforma_identidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mpi_select ON public.motorista_plataforma_identidades;
CREATE POLICY mpi_select ON public.motorista_plataforma_identidades
  FOR SELECT TO authenticated
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas'));

DROP POLICY IF EXISTS mpi_insert ON public.motorista_plataforma_identidades;
CREATE POLICY mpi_insert ON public.motorista_plataforma_identidades
  FOR INSERT TO authenticated
  WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas', 'editar'));

DROP POLICY IF EXISTS mpi_update ON public.motorista_plataforma_identidades;
CREATE POLICY mpi_update ON public.motorista_plataforma_identidades
  FOR UPDATE TO authenticated
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas', 'editar'))
  WITH CHECK (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas', 'editar'));

DROP POLICY IF EXISTS mpi_delete ON public.motorista_plataforma_identidades;
CREATE POLICY mpi_delete ON public.motorista_plataforma_identidades
  FOR DELETE TO authenticated
  USING (is_current_user_admin() OR has_permission(auth.uid(), 'motoristas', 'editar'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.motorista_plataforma_identidades TO authenticated;

-- Backfill: o que está na ficha, mais — e isto é o que interessa — todos os
-- ids que já apareceram ligados em resumos. É assim que se recuperam os ids
-- antigos de quem mudou de conta Bolt.
INSERT INTO public.motorista_plataforma_identidades (org_id, motorista_id, plataforma, identificador, origem)
SELECT DISTINCT m.org_id, m.id, 'bolt', m.bolt_id, 'backfill_ficha'
FROM public.motoristas_ativos m
WHERE m.bolt_id IS NOT NULL AND btrim(m.bolt_id) <> '' AND m.org_id IS NOT NULL
ON CONFLICT (org_id, plataforma, identificador) DO NOTHING;

INSERT INTO public.motorista_plataforma_identidades (org_id, motorista_id, plataforma, identificador, origem)
SELECT DISTINCT m.org_id, m.id, 'uber', m.uber_uuid, 'backfill_ficha'
FROM public.motoristas_ativos m
WHERE m.uber_uuid IS NOT NULL AND btrim(m.uber_uuid) <> '' AND m.org_id IS NOT NULL
ON CONFLICT (org_id, plataforma, identificador) DO NOTHING;

INSERT INTO public.motorista_plataforma_identidades (org_id, motorista_id, plataforma, identificador, integracao_id, origem)
SELECT DISTINCT ON (r.org_id, r.identificador_motorista)
       r.org_id, r.motorista_id, 'bolt', r.identificador_motorista, r.integracao_id, 'backfill_resumos'
FROM public.bolt_resumos_semanais r
WHERE r.motorista_id IS NOT NULL
  AND r.identificador_motorista IS NOT NULL
  AND btrim(r.identificador_motorista) <> ''
  AND r.org_id IS NOT NULL
ORDER BY r.org_id, r.identificador_motorista, r.periodo_inicio DESC
ON CONFLICT (org_id, plataforma, identificador) DO NOTHING;

INSERT INTO public.motorista_plataforma_identidades (org_id, motorista_id, plataforma, identificador, integracao_id, origem)
SELECT DISTINCT ON (r.org_id, r.uber_driver_id)
       r.org_id, r.motorista_id, 'uber', r.uber_driver_id, r.integracao_id, 'backfill_resumos'
FROM public.uber_resumos_semanais r
WHERE r.motorista_id IS NOT NULL
  AND r.uber_driver_id IS NOT NULL
  AND btrim(r.uber_driver_id) <> ''
ORDER BY r.org_id, r.uber_driver_id, r.periodo_inicio DESC
ON CONFLICT (org_id, plataforma, identificador) DO NOTHING;

-- ------------------------------------------------------------
-- 3) Normalização do número de cartão
-- ------------------------------------------------------------
-- A cartoes_frota guarda o número curto ("2160", "586", "18") e os ficheiros
-- da Repsol/EDP trazem o PAN inteiro ("9724998589692160"). O importador só
-- tentava os últimos 4 do PAN, tal e qual — e "0586" nunca casava com "586".
-- Aqui os dois lados passam pela mesma função: dígitos, últimos 4, à esquerda
-- com zeros.

CREATE OR REPLACE FUNCTION public.normalizar_numero_cartao(p_numero text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    lpad(right(regexp_replace(COALESCE(p_numero, ''), '\D', '', 'g'), 4), 4, '0'),
    '0000'
  );
$$;

COMMENT ON FUNCTION public.normalizar_numero_cartao(text) IS
  'Últimos 4 dígitos com zeros à esquerda. Põe o número curto da cartoes_frota '
  'e o PAN do ficheiro na mesma forma.';

-- ------------------------------------------------------------
-- 4) Resolvers — quem era o dono naquela data
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.resolver_motorista_por_cartao(
  p_org_id uuid,
  p_tipo   text,
  p_numero text,
  p_data   date
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Ambíguo devolve NULL de propósito: dois cartões do mesmo tipo acabados nos
  -- mesmos 4 dígitos existem, e atribuir ao motorista errado é pior do que
  -- deixar por atribuir.
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(a.motorista_id))[1] END
  FROM public.cartao_atribuicoes a
  JOIN public.cartoes_frota c ON c.id = a.cartao_id
  WHERE a.org_id = p_org_id
    AND c.tipo = p_tipo
    AND public.normalizar_numero_cartao(c.numero) = public.normalizar_numero_cartao(p_numero)
    AND p_data >= a.de
    AND (a.ate IS NULL OR p_data <= a.ate);
$$;

CREATE OR REPLACE FUNCTION public.resolver_motorista_por_plataforma(
  p_org_id        uuid,
  p_plataforma    text,
  p_identificador text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.motorista_id
  FROM public.motorista_plataforma_identidades i
  WHERE i.org_id = p_org_id
    AND i.plataforma = p_plataforma
    AND i.identificador = p_identificador
  LIMIT 1;
$$;

-- A Via Verde não tem cartão: identifica a VIATURA. O histórico de quem
-- conduzia o quê já existe (motorista_viaturas), por isso é só usá-lo.
CREATE OR REPLACE FUNCTION public.resolver_motorista_por_viatura(
  p_viatura_id uuid,
  p_data       date
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN count(*) = 1 THEN (array_agg(mv.motorista_id))[1] END
  FROM public.motorista_viaturas mv
  WHERE mv.viatura_id = p_viatura_id
    AND p_data >= mv.data_inicio
    AND (mv.data_fim IS NULL OR p_data <= mv.data_fim);
$$;

REVOKE ALL ON FUNCTION public.resolver_motorista_por_cartao(uuid, text, text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolver_motorista_por_plataforma(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolver_motorista_por_viatura(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_motorista_por_cartao(uuid, text, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_motorista_por_plataforma(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_motorista_por_viatura(uuid, date) TO authenticated;

-- ------------------------------------------------------------
-- 5) O motorista_id das tabelas em bruto passa a ser DERIVADO
-- ------------------------------------------------------------
-- A coluna fica — há muito ecrã a lê-la — mas deixa de ser o importador a
-- decidir. Estes gatilhos recalculam-na a partir do histórico, tanto na
-- importação como sempre que o histórico muda.

-- Regra dos três gatilhos: o histórico manda, MAS uma resolução vazia nunca
-- apaga uma atribuição que já existe. O backfill só conhece o detentor actual
-- e o anterior — sem esta guarda, a próxima importação que tocasse em linhas
-- antigas punha-as a NULL e o dinheiro desaparecia da conta de alguém sem
-- ninguém dar por isso. Para corrigir uma atribuição errada, acrescenta-se o
-- período certo à cartao_atribuicoes: aí a resolução devolve alguém e ganha.

CREATE OR REPLACE FUNCTION public.tg_resolver_motorista_cartao()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_numero text;
  v_resolvido uuid;
BEGIN
  IF TG_TABLE_NAME = 'bp_transacoes' THEN
    SELECT bc.card_number INTO v_numero
    FROM public.bp_cartoes bc WHERE bc.id = NEW.card_id;
  ELSE
    v_numero := NEW.card_number;
  END IF;

  v_resolvido := public.resolver_motorista_por_cartao(
    NEW.org_id, TG_ARGV[0], v_numero, NEW.transaction_date::date
  );

  IF v_resolvido IS NOT NULL OR TG_OP = 'INSERT' THEN
    NEW.motorista_id := v_resolvido;
  ELSE
    NEW.motorista_id := OLD.motorista_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tg_resolver_motorista_viatura()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_resolvido uuid;
BEGIN
  v_resolvido := public.resolver_motorista_por_viatura(
    NEW.viatura_id, NEW.transaction_date::date
  );

  IF v_resolvido IS NOT NULL OR TG_OP = 'INSERT' THEN
    NEW.motorista_id := v_resolvido;
  ELSE
    NEW.motorista_id := OLD.motorista_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tg_resolver_motorista_plataforma()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_id text;
  v_resolvido uuid;
BEGIN
  v_id := CASE TG_ARGV[0]
            WHEN 'bolt' THEN NEW.identificador_motorista
            ELSE NEW.uber_driver_id
          END;
  v_resolvido := public.resolver_motorista_por_plataforma(NEW.org_id, TG_ARGV[0], v_id);

  IF v_resolvido IS NOT NULL OR TG_OP = 'INSERT' THEN
    NEW.motorista_id := v_resolvido;
  ELSE
    NEW.motorista_id := OLD.motorista_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS resolver_motorista ON public.repsol_transacoes;
CREATE TRIGGER resolver_motorista BEFORE INSERT OR UPDATE ON public.repsol_transacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_resolver_motorista_cartao('repsol');

DROP TRIGGER IF EXISTS resolver_motorista ON public.edp_transacoes;
CREATE TRIGGER resolver_motorista BEFORE INSERT OR UPDATE ON public.edp_transacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_resolver_motorista_cartao('edp');

DROP TRIGGER IF EXISTS resolver_motorista ON public.bp_transacoes;
CREATE TRIGGER resolver_motorista BEFORE INSERT OR UPDATE ON public.bp_transacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_resolver_motorista_cartao('bp');

DROP TRIGGER IF EXISTS resolver_motorista ON public.via_verde_transacoes;
CREATE TRIGGER resolver_motorista BEFORE INSERT OR UPDATE ON public.via_verde_transacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_resolver_motorista_viatura();

DROP TRIGGER IF EXISTS resolver_motorista ON public.bolt_resumos_semanais;
CREATE TRIGGER resolver_motorista BEFORE INSERT OR UPDATE ON public.bolt_resumos_semanais
  FOR EACH ROW EXECUTE FUNCTION public.tg_resolver_motorista_plataforma('bolt');

DROP TRIGGER IF EXISTS resolver_motorista ON public.uber_resumos_semanais;
CREATE TRIGGER resolver_motorista BEFORE INSERT OR UPDATE ON public.uber_resumos_semanais
  FOR EACH ROW EXECUTE FUNCTION public.tg_resolver_motorista_plataforma('uber');

-- ------------------------------------------------------------
-- 6) Corrigir o histórico recalcula os movimentos
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recalcular_movimentos_do_cartao(p_cartao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo   text;
  v_numero text;
  v_org    uuid;
BEGIN
  SELECT c.tipo, public.normalizar_numero_cartao(c.numero), c.org_id
    INTO v_tipo, v_numero, v_org
  FROM public.cartoes_frota c WHERE c.id = p_cartao_id;
  IF v_numero IS NULL THEN RETURN; END IF;

  -- O UPDATE volta a disparar o gatilho de resolução de cada tabela.
  IF v_tipo = 'repsol' THEN
    UPDATE public.repsol_transacoes SET updated_at = updated_at
    WHERE org_id = v_org AND public.normalizar_numero_cartao(card_number) = v_numero;
  ELSIF v_tipo = 'edp' THEN
    UPDATE public.edp_transacoes SET updated_at = updated_at
    WHERE org_id = v_org AND public.normalizar_numero_cartao(card_number) = v_numero;
  ELSIF v_tipo = 'bp' THEN
    UPDATE public.bp_transacoes t SET updated_at = t.updated_at
    FROM public.bp_cartoes bc
    WHERE bc.id = t.card_id AND t.org_id = v_org
      AND public.normalizar_numero_cartao(bc.card_number) = v_numero;
  END IF;
END $$;

-- As tabelas de combustível não têm todas updated_at; onde não houver, o
-- UPDATE acima falha. Este bloco garante a coluna, sem tocar nos dados.
ALTER TABLE public.repsol_transacoes ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE public.edp_transacoes    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION public.tg_atribuicao_alterada()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.recalcular_movimentos_do_cartao(COALESCE(NEW.cartao_id, OLD.cartao_id));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS atribuicao_alterada ON public.cartao_atribuicoes;
CREATE TRIGGER atribuicao_alterada
  AFTER INSERT OR UPDATE OR DELETE ON public.cartao_atribuicoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_atribuicao_alterada();

-- ------------------------------------------------------------
-- 7) Semanas já fechadas que a correcção afectou
-- ------------------------------------------------------------
-- Corrigir o passado é metade do trabalho. Se a semana já foi fechada, o
-- resumo do motorista continua com o número velho até alguém voltar a fechar
-- — e isso não pode depender de memória.

CREATE TABLE IF NOT EXISTS public.refecho_pendente (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizacoes(id) ON DELETE CASCADE,
  semana_inicio date NOT NULL,
  semana_fim    date NOT NULL,
  motivo        text NOT NULL,
  detalhe       jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  resolvido_em  timestamptz,
  CONSTRAINT refecho_pendente_unico UNIQUE (org_id, semana_inicio, semana_fim, motivo)
);

COMMENT ON TABLE public.refecho_pendente IS
  'Semanas já fechadas cujos dados mudaram depois do fecho. Enquanto '
  'resolvido_em for NULL, o resumo do motorista está desactualizado.';

CREATE INDEX IF NOT EXISTS refecho_pendente_aberto_idx
  ON public.refecho_pendente (org_id, semana_inicio)
  WHERE resolvido_em IS NULL;

ALTER TABLE public.refecho_pendente ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refecho_pendente_select ON public.refecho_pendente;
CREATE POLICY refecho_pendente_select ON public.refecho_pendente
  FOR SELECT TO authenticated
  USING (is_current_user_admin() OR can_view_financeiro());

DROP POLICY IF EXISTS refecho_pendente_update ON public.refecho_pendente;
CREATE POLICY refecho_pendente_update ON public.refecho_pendente
  FOR UPDATE TO authenticated
  USING (is_current_user_admin() OR can_view_financeiro())
  WITH CHECK (is_current_user_admin() OR can_view_financeiro());

GRANT SELECT, UPDATE ON public.refecho_pendente TO authenticated;

CREATE OR REPLACE FUNCTION public.marcar_refecho_por_atribuicao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_de  date := LEAST(COALESCE(NEW.de, OLD.de), COALESCE(OLD.de, NEW.de));
  v_ate date := GREATEST(
    COALESCE(NEW.ate, CURRENT_DATE), COALESCE(OLD.ate, CURRENT_DATE)
  );
  v_org uuid := COALESCE(NEW.org_id, OLD.org_id);
BEGIN
  INSERT INTO public.refecho_pendente (org_id, semana_inicio, semana_fim, motivo, detalhe)
  SELECT DISTINCT r.org_id, r.semana_inicio, r.semana_fim,
         'atribuicao_de_cartao_alterada',
         jsonb_build_object('cartao_id', COALESCE(NEW.cartao_id, OLD.cartao_id))
  FROM public.motorista_resumo_semanal r
  WHERE r.org_id = v_org
    AND r.semana_fim >= v_de
    AND r.semana_inicio <= v_ate
  ON CONFLICT (org_id, semana_inicio, semana_fim, motivo) DO NOTHING;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS marcar_refecho ON public.cartao_atribuicoes;
CREATE TRIGGER marcar_refecho
  AFTER INSERT OR UPDATE OR DELETE ON public.cartao_atribuicoes
  FOR EACH ROW EXECUTE FUNCTION public.marcar_refecho_por_atribuicao();
