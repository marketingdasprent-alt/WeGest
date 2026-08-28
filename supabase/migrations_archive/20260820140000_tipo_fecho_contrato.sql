-- ============================================================
-- Como o contrato acabou: devolvida ou recolhida
-- ============================================================
-- REGRA DE NEGÓCIO (dono do produto, 2026-08-20)
--   Devolvida  — o motorista trouxe a viatura. Fim normal.
--   Recolhida  — não a quis entregar e a empresa foi buscá-la. Há conflito,
--                e quase sempre fica a dever.
--
-- São dois factos com peso muito diferente sobre o motorista.
--
-- O QUE ESTAVA MAL
-- O FecharContratoDialog pergunta isto num radio OBRIGATÓRIO ("Selecciona o que
-- foi feito com a viatura": Recolhida / Devolvida) — e a resposta era deitada
-- fora. Em todo o fecho, `tipoEvento` era usado num único sítio: a compor a
-- descrição do débito em motorista_financeiro, e só quando havia débito
-- (useContratosRenting.ts, `tipoEvento === 'recolhido' ? '(recolha)' : '(devolução)'`).
-- Não ia para o contrato, não ia para o evento de calendário (esse é sempre
-- tipo='recolha' — 'devolucao' pertence ao sistema legado de `contratos` e
-- ficaria órfão) e não ia para a folha de danos.
--
-- Consequência: não há como saber, mais tarde, que motoristas tiveram viaturas
-- recolhidas à força. A informação existia durante um instante no formulário.
--
-- NÃO TRANSITA PARA O SUCESSOR
-- `tipo_fecho` descreve como ESTE contrato acabou. Numa troca de viatura o
-- fecho do elo antigo grava-o, e o clone (que copia as colunas a partir do
-- catálogo, ver 20260820120000) herdá-lo-ia — o elo novo nasceria a dizer que
-- foi recolhido sem nunca ter acabado. Por isso a RPC é redefinida aqui com
-- `tipo_fecho` na lista de campos repostos a NULL, ao lado dos km e do
-- combustível: registo operacional é de cada elo.
--
-- Idempotente e aditiva.
-- ============================================================

ALTER TABLE public.contratos_renting
  ADD COLUMN IF NOT EXISTS tipo_fecho text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contratos_renting_tipo_fecho_check'
  ) THEN
    ALTER TABLE public.contratos_renting
      ADD CONSTRAINT contratos_renting_tipo_fecho_check
      CHECK (tipo_fecho IS NULL OR tipo_fecho IN ('recolhido', 'devolvido'));
  END IF;
END $$;

COMMENT ON COLUMN public.contratos_renting.tipo_fecho IS
  'Como o contrato acabou: "devolvido" (o motorista trouxe a viatura, fim '
  'normal) ou "recolhido" (não a entregou e a empresa foi buscá-la — há '
  'conflito e quase sempre dívida). NULL = contrato ainda não fechado, ou '
  'fechado antes desta coluna existir. Escrito por useFecharContrato; NUNCA '
  'transita para a versão seguinte numa troca de viatura.';

-- ------------------------------------------------------------
-- A RPC de versionamento repõe tipo_fecho a NULL no elo novo
-- ------------------------------------------------------------
-- Só muda a lista do CASE face a 20260820120000 — o resto é igual.
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

  IF v_old.estado_financeiro IN ('facturado', 'pago') THEN
    RAISE EXCEPTION 'Não podes versionar um contrato %. Trata da facturação primeiro.',
      v_old.estado_financeiro;
  END IF;

  IF v_old.org_id <> get_current_org_id() THEN
    RAISE EXCEPTION 'Sem permissão sobre este contrato.';
  END IF;

  v_data := COALESCE(p_data_troca, now());
  IF v_data < v_old.data_inicio THEN
    RAISE EXCEPTION 'A data da troca (%) é anterior ao início do contrato (%).',
      v_data, v_old.data_inicio;
  END IF;

  UPDATE public.contratos_renting
     SET substituido_em     = now(),
         estado_operacional = 'cancelado'::contrato_estado_operacional_enum,
         data_fim           = v_data,
         updated_by         = v_user_id
   WHERE id = v_old.id;

  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position),
         string_agg(
           CASE c.column_name
             WHEN 'versao'               THEN '$2'
             WHEN 'contrato_anterior_id' THEN '$1'
             WHEN 'motivo_versao'        THEN '$3'
             WHEN 'substituido_em'       THEN 'NULL'
             WHEN 'deleted_at'           THEN 'NULL'
             WHEN 'data_inicio'          THEN '$4'
             WHEN 'data_fim'             THEN '$6'
             WHEN 'estado_operacional'   THEN '''agendado''::contrato_estado_operacional_enum'
             WHEN 'estado_financeiro'    THEN '''pendente''::contrato_estado_financeiro_enum'
             WHEN 'facturado_em'         THEN 'NULL'
             WHEN 'tipo_fecho'           THEN 'NULL'
             WHEN 'km_saida'             THEN 'NULL'
             WHEN 'km_entrada'           THEN 'NULL'
             WHEN 'combustivel_saida'    THEN 'NULL'
             WHEN 'combustivel_entrada'  THEN 'NULL'
             WHEN 'eletricidade_saida'   THEN 'NULL'
             WHEN 'eletricidade_entrada' THEN 'NULL'
             WHEN 'dua_devolvida_em'     THEN 'NULL'
             WHEN 'entrega_via_any_rent' THEN 'false'
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
     AND c.is_generated  = 'NEVER'
     AND c.column_name  <> 'id';

  EXECUTE format(
    'INSERT INTO public.contratos_renting (%s) SELECT %s FROM public.contratos_renting WHERE id = $1 RETURNING id',
    v_cols, v_vals
  )
  INTO v_new_id
  USING v_old.id, v_old.versao + 1, p_motivo, v_data, v_user_id, v_old.data_fim;

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

-- ============================================================
-- VERIFICAÇÃO (correr à mão depois de aplicar)
-- ============================================================
-- Motoristas com viaturas recolhidas à força (o que antes era impossível saber):
--   SELECT c.codigo, c.matricula, c.data_fim, c.tipo_fecho
--     FROM contratos_renting c
--    WHERE c.tipo_fecho = 'recolhido' AND c.deleted_at IS NULL
--    ORDER BY c.data_fim DESC;
--
-- Nenhum sucessor deve herdar tipo_fecho:
--   SELECT b.codigo, b.versao, b.tipo_fecho
--     FROM contratos_renting b
--    WHERE b.contrato_anterior_id IS NOT NULL AND b.tipo_fecho IS NOT NULL;
