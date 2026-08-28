-- ============================================================
-- Troca / upgrade / downgrade de viatura: cadeia rastreável
-- ============================================================
-- REGRA (dono do produto, 2026-08-20)
--   O versionamento mantém-se: a troca fecha o contrato antigo e abre um novo.
--   O que passa a ser exigido é RASTREABILIDADE:
--     A. os dois elos ligados e navegáveis nos dois sentidos;
--     B. histórico em AMBOS — de onde veio / para onde foi;
--     C. linha temporal reconstituível: "de DD/MM a DD/MM, contrato #A,
--        viatura X, valor V1" → "de DD/MM a DD/MM, contrato #B, viatura Y, V2";
--     D. folha de danos das duas viaturas, obrigatórias;
--     E. os dados a jusante seguem a cadeia.
--
--   E a regra que a governa toda: um contrato fechado/alterado/cancelado
--   NUNCA muda de dados. A versão antiga tem de continuar a exibir tudo o que
--   exibia — valores, motoristas, empresas — porque vai ser consultada.
--
-- O QUE ESTAVA MAL
--
--   1. A cópia da versão era uma LISTA DE COLUNAS ESCRITA À MÃO. Toda a coluna
--      acrescentada depois de 2026-07-23 ficava silenciosamente para trás em
--      cada troca. Duas regressões já confirmadas: `emissor_id` (acrescentado
--      de propósito em 20260611000001:143 — "sem isto, upgrades/downgrades
--      perdiam o emissor silenciosamente") e `gestor_id` (20260615000002:199 —
--      "senão a troca de viatura cria uma versão sem dono"). As redefinições
--      de 20260714130000 e 20260723150001 reescreveram a lista sem os dois.
--      Também `tarifa_id` — que faz o gatilho trg_contrato_preco_acordado
--      (20260819140000) não semear o preço congelado, por a guarda
--      `NEW.tarifa_id IS NOT NULL` falhar no INSERT.
--      Fix: a lista passa a ser construída do catálogo (information_schema).
--      Qualquer coluna futura é copiada sozinha. A lista deixa de apodrecer.
--
--   2. NENHUM caminho escrevia a FRONTEIRA TEMPORAL da troca. O contrato
--      antigo ficava `cancelado` mas com a `data_fim` original, e o novo
--      nascia com a `data_inicio` original. Os dois elos partilhavam o mesmo
--      intervalo — e é daí que nasciam a sobreposição em motorista_viaturas,
--      a semana da troca inteira imputada à viatura nova, e as portagens da
--      viatura antiga a caírem em quem já a tinha devolvido.
--      Fix: antigo fecha em `p_data_troca`; novo abre em `p_data_troca`.
--
--   3. O elo novo herdava `estado_operacional` do antigo (tipicamente
--      'em_curso'). Como tipoRealizacaoPendenteEsperada() devolve 'recolha'
--      para 'em_curso', o contrato novo pedia RECOLHER a viatura que acabara
--      de ser entregue — a folha de ENTREGA da viatura nova nunca era pedida.
--      Fix: o elo novo nasce 'agendado' → a entrega fica pendente, como em
--      qualquer contrato novo.
--
--   4. A guarda de versionamento só travava `facturado`. O enum tem também
--      `pago`, e o elo novo herdava esse estado por cima do 'pendente' —
--      nascendo marcado como PAGO, com facturado_em NULL, invisível em
--      qualquer relatório de "por facturar".
--      Fix: a guarda passa a travar 'facturado' E 'pago'.
--
--   5. A troca desactivava o motorista. contrato_renting_liga_motorista_close
--      corre no fecho, não encontra outro contrato activo (o sucessor ainda
--      não existe) e põe motoristas_ativos.status_ativo = false. Numa troca o
--      motorista NÃO saiu — fica com outro carro.
--      Fix: a RPC reactiva os condutores da cadeia depois de criar o sucessor.
--
--   6. O histórico não registava a troca: o gatilho de contrato_historico
--      gravava 'alteracao' com detalhe NULL, e o CHECK da tabela nem tinha um
--      tipo para isto.
--      Fix: tipo 'troca_viatura' + um registo em CADA elo, com matrícula de
--      origem e destino e o id do outro contrato.
--
--   7. `contrato_anterior_id` não tinha UNIQUE. "No máximo um sucessor" era
--      só uma convenção — e useContratoVersoes faz .limit(1) a contar com ela.
--      Fix: índice único parcial. A cadeia deixa de poder bifurcar.
--
-- ORDEM DAS OPERAÇÕES (não trocar)
--   O EXCLUDE anti-overbooking (contratos_no_overbooking) tem
--   `WHERE substituido_em IS NULL AND estado_operacional IN ('agendado','em_curso')`.
--   Por isso o elo antigo TEM de ser marcado substituído ANTES do INSERT do
--   novo — senão os dois, com a mesma viatura e períodos sobrepostos, violam a
--   constraint. Consequência: quando o INSERT lê a linha antiga, ela já tem a
--   `data_fim` nova — daí `data_fim` ser reposta a partir de v_old (capturado
--   antes de qualquer UPDATE) e não lida da tabela.
--
-- Idempotente e aditiva. Não altera dados existentes (o backfill da fronteira
-- temporal das trocas já feitas está na migração seguinte, à parte, para poder
-- ser corrido e conferido isoladamente).
-- ============================================================

-- ------------------------------------------------------------
-- 1) O histórico passa a ter um tipo para a troca
-- ------------------------------------------------------------
ALTER TABLE public.contrato_historico
  DROP CONSTRAINT IF EXISTS contrato_historico_evento_tipo_check;

ALTER TABLE public.contrato_historico
  ADD CONSTRAINT contrato_historico_evento_tipo_check
  CHECK (evento_tipo IN (
    'reserva_criada', 'contrato_aberto', 'contrato_fechado',
    'contrato_faturado', 'faturacao_anulada', 'alteracao',
    'troca_viatura'
  ));

COMMENT ON CONSTRAINT contrato_historico_evento_tipo_check ON public.contrato_historico IS
  'Tipos de evento do histórico. "troca_viatura" é gravado nos DOIS elos da '
  'cadeia por criar_versao_contrato_renting — no antigo diz para onde foi, no '
  'novo diz de onde veio.';

-- ------------------------------------------------------------
-- 2) A cadeia não pode bifurcar
-- ------------------------------------------------------------
-- Parcial (só linhas não eliminadas) para não colidir com soft-delete.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contratos_renting_sucessor_unico
  ON public.contratos_renting (contrato_anterior_id)
  WHERE contrato_anterior_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX public.uq_contratos_renting_sucessor_unico IS
  'Cada versão tem no máximo um sucessor. Era só convenção procedimental; '
  'useContratosRenting.useContratoVersoes faz .limit(1) a contar com isto.';

-- ------------------------------------------------------------
-- 3) A RPC: implementação com data da troca explícita
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.criar_versao_contrato_renting(
  p_contrato_id uuid,
  p_motivo      text,
  p_data_troca  timestamptz
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old        contratos_renting%ROWTYPE;
  v_new_id     uuid;
  v_user_id    uuid := auth.uid();
  v_data       timestamptz;
  v_cols       text;
  v_vals       text;
  v_matricula  text;
BEGIN
  SELECT * INTO v_old
    FROM public.contratos_renting
   WHERE id = p_contrato_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato % não encontrado.', p_contrato_id;
  END IF;

  IF v_old.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Não podes versionar um contrato eliminado.';
  END IF;

  IF v_old.substituido_em IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato já foi substituído. Versiona a versão actual.';
  END IF;

  -- 'pago' juntou-se a 'facturado': um contrato já cobrado não pode ser
  -- versionado sem alguém tratar da cobrança primeiro.
  IF v_old.estado_financeiro IN ('facturado', 'pago') THEN
    RAISE EXCEPTION 'Não podes versionar um contrato %. Trata da facturação primeiro.',
      v_old.estado_financeiro;
  END IF;

  IF v_old.org_id <> get_current_org_id() THEN
    RAISE EXCEPTION 'Sem permissão sobre este contrato.';
  END IF;

  -- A troca não pode começar antes do contrato que substitui.
  v_data := COALESCE(p_data_troca, now());
  IF v_data < v_old.data_inicio THEN
    RAISE EXCEPTION 'A data da troca (%) é anterior ao início do contrato (%).',
      v_data, v_old.data_inicio;
  END IF;

  -- ── Fecha o elo antigo NA FRONTEIRA ─────────────────────────
  -- Mesmo instante em que o marca substituído: OLD.substituido_em ainda é NULL
  -- aqui, por isso o trigger de imutabilidade deixa passar. `data_fim` passa a
  -- ser a data da troca — é isto que dá ao elo antigo um período FECHADO e
  -- termina a sobreposição com o sucessor.
  UPDATE public.contratos_renting
     SET substituido_em     = now(),
         estado_operacional = 'cancelado'::contrato_estado_operacional_enum,
         data_fim           = v_data,
         updated_by         = v_user_id
   WHERE id = v_old.id;

  -- ── Clona: lista de colunas vinda do catálogo ───────────────
  -- Tudo o que não estiver explicitamente listado no CASE é copiado tal e
  -- qual. É esta a garantia de que nenhuma coluna futura volta a perder-se.
  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position),
         string_agg(
           CASE c.column_name
             -- identidade da nova versão
             WHEN 'versao'               THEN '$2'
             WHEN 'contrato_anterior_id' THEN '$1'
             WHEN 'motivo_versao'        THEN '$3'
             WHEN 'substituido_em'       THEN 'NULL'
             WHEN 'deleted_at'           THEN 'NULL'
             -- fronteira temporal: abre na troca, mantém o fim original
             WHEN 'data_inicio'          THEN '$4'
             WHEN 'data_fim'             THEN '$6'
             -- a entrega da viatura nova está POR FAZER
             WHEN 'estado_operacional'   THEN '''agendado''::contrato_estado_operacional_enum'
             -- facturação recomeça do zero neste elo
             WHEN 'estado_financeiro'    THEN '''pendente''::contrato_estado_financeiro_enum'
             WHEN 'facturado_em'         THEN 'NULL'
             -- registo operacional é de cada elo, não transita
             WHEN 'km_saida'             THEN 'NULL'
             WHEN 'km_entrada'           THEN 'NULL'
             WHEN 'combustivel_saida'    THEN 'NULL'
             WHEN 'combustivel_entrada'  THEN 'NULL'
             WHEN 'eletricidade_saida'   THEN 'NULL'
             WHEN 'eletricidade_entrada' THEN 'NULL'
             WHEN 'dua_devolvida_em'     THEN 'NULL'
             WHEN 'entrega_via_any_rent' THEN 'false'
             -- autoria
             WHEN 'created_by'           THEN '$5'
             WHEN 'updated_by'           THEN '$5'
             WHEN 'created_at'           THEN 'now()'
             WHEN 'updated_at'           THEN 'now()'
             ELSE quote_ident(c.column_name)
           END, ', ' ORDER BY c.ordinal_position)
    INTO v_cols, v_vals
    FROM information_schema.columns c
   WHERE c.table_schema  = 'public'
     AND c.table_name    = 'contratos_renting'
     AND c.is_generated  = 'NEVER'        -- exclui `periodo` (GENERATED)
     AND c.column_name  <> 'id';

  EXECUTE format(
    'INSERT INTO public.contratos_renting (%s) SELECT %s FROM public.contratos_renting WHERE id = $1 RETURNING id',
    v_cols, v_vals
  )
  INTO v_new_id
  USING v_old.id, v_old.versao + 1, p_motivo, v_data, v_user_id, v_old.data_fim;

  -- ── Relações m:n ────────────────────────────────────────────
  INSERT INTO public.contrato_condutores (
    org_id, contrato_id, cliente_id, motorista_id, is_principal
  )
  SELECT org_id, v_new_id, cliente_id, motorista_id, is_principal
    FROM public.contrato_condutores
   WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_coberturas (
    org_id, contrato_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
  )
  SELECT org_id, v_new_id, cobertura_id, cobertura_nome, preco_dia, franquia_valor
    FROM public.contrato_coberturas
   WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_extras (
    org_id, contrato_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
  )
  SELECT org_id, v_new_id, extra_id, extra_nome, preco_unidade, tipo_calculo, quantidade, total
    FROM public.contrato_extras
   WHERE contrato_id = v_old.id;

  INSERT INTO public.contrato_taxas (
    org_id, contrato_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado
  )
  SELECT org_id, v_new_id, taxa_id, taxa_nome, percentagem, valor_fixo, base_calculo, valor_calculado
    FROM public.contrato_taxas
   WHERE contrato_id = v_old.id;

  -- ── Uma troca não é uma saída: o motorista continua activo ───
  -- contrato_renting_liga_motorista_close corre no fecho, quando o sucessor
  -- ainda não existe, e por isso conclui (erradamente) que o motorista ficou
  -- sem contrato. Aqui já existe — repõe-se.
  UPDATE public.motoristas_ativos ma
     SET status_ativo = true
   WHERE ma.status_ativo = false
     AND (
       EXISTS (
         SELECT 1 FROM public.contrato_condutores cc
          WHERE cc.contrato_id = v_new_id AND cc.motorista_id = ma.id
       )
       OR EXISTS (
         SELECT 1 FROM public.contratos_renting cr
          WHERE cr.id = v_new_id AND cr.cliente_id = ma.cliente_id
       )
     );

  -- ── Histórico nos DOIS elos ─────────────────────────────────
  SELECT matricula INTO v_matricula FROM public.viaturas WHERE id = v_old.viatura_id;

  INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe)
  VALUES (
    v_old.id, v_old.org_id, 'troca_viatura', v_user_id,
    format('Substituído pelo contrato %s em %s. Viatura à saída: %s. Motivo: %s',
           v_new_id, to_char(v_data, 'DD/MM/YYYY HH24:MI'),
           COALESCE(v_matricula, v_old.matricula, '—'),
           COALESCE(NULLIF(trim(p_motivo), ''), '—'))
  );

  INSERT INTO public.contrato_historico (contrato_id, org_id, evento_tipo, ator_id, detalhe)
  VALUES (
    v_new_id, v_old.org_id, 'troca_viatura', v_user_id,
    format('Continua o contrato %s (versão %s), a partir de %s. Viatura anterior: %s. Motivo: %s',
           v_old.id, v_old.versao, to_char(v_data, 'DD/MM/YYYY HH24:MI'),
           COALESCE(v_matricula, v_old.matricula, '—'),
           COALESCE(NULLIF(trim(p_motivo), ''), '—'))
  );

  RETURN v_new_id;
END;
$function$;

COMMENT ON FUNCTION public.criar_versao_contrato_renting(uuid, text, timestamptz) IS
  'Fecha o contrato na data da troca e abre o sucessor a partir dessa data. '
  'A cópia das colunas vem do catálogo — colunas novas são herdadas sozinhas, '
  'sem ninguém ter de se lembrar de as acrescentar aqui. Grava histórico nos '
  'dois elos e mantém o motorista activo (uma troca não é uma saída).';

-- ------------------------------------------------------------
-- 4) Assinatura antiga mantida — delega, com a troca a valer "agora"
-- ------------------------------------------------------------
-- Duas aridades distintas, sem DEFAULT: não há ambiguidade de resolução para
-- o PostgREST. Quem ainda chamar a de 2 argumentos continua a funcionar.
CREATE OR REPLACE FUNCTION public.criar_versao_contrato_renting(
  p_contrato_id uuid,
  p_motivo      text
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.criar_versao_contrato_renting($1, $2, now());
$function$;

COMMENT ON FUNCTION public.criar_versao_contrato_renting(uuid, text) IS
  'Compatibilidade: delega na versão de 3 argumentos com a troca a valer agora.';

-- ============================================================
-- VERIFICAÇÃO (correr à mão depois de aplicar)
-- ============================================================
-- 1) A lista de colunas do clone cobre a tabela toda?
--    SELECT count(*) FROM information_schema.columns
--     WHERE table_schema='public' AND table_name='contratos_renting'
--       AND is_generated='NEVER' AND column_name<>'id';
--
-- 2) Nenhuma cadeia bifurcada antes de criar o índice único?
--    SELECT contrato_anterior_id, count(*) FROM contratos_renting
--     WHERE contrato_anterior_id IS NOT NULL AND deleted_at IS NULL
--     GROUP BY 1 HAVING count(*) > 1;
--    (se devolver linhas, o CREATE UNIQUE INDEX acima falha — resolver primeiro)
--
-- 3) Elos com período sobreposto (o que esta migração passa a impedir):
--    SELECT a.codigo, a.id, a.data_inicio, a.data_fim, b.id, b.data_inicio
--      FROM contratos_renting a JOIN contratos_renting b ON b.contrato_anterior_id = a.id
--     WHERE a.data_fim IS NULL OR a.data_fim > b.data_inicio;
