-- Resumo da semana na ficha do motorista para quem não tem o Financeiro.
--
-- A aba Resumos da ficha usa a mesma conta da lista de Contas/Resumo, mas essa
-- conta lê tabelas que só abrem a financeiro_recibos (Bolt, combustível,
-- portagens, contas Uber) ou a renting_contratos (contratos). Abrir essas
-- tabelas ao Gestor dava-lhe a organização inteira pela API. Em vez disso:
--   1. recurso novo motoristas_resumos (categoria Motoristas);
--   2. resumo_semana_motorista_ficha devolve só as linhas de que a conta precisa
--      para UM motorista numa semana. O resto (ficha, Uber, movimentos,
--      tarifas) o Gestor já lê pelas suas próprias políticas.
--
-- Filtros iguais aos de useContasResumoSemana, para os números baterem certo:
--   · Bolt: as do motorista e, das sem motorista, só as que o emparelhamento do
--     frontend (isNameMatch) PODE dar a este: o mesmo identificador Bolt, ou um
--     nome contido no outro, ou uma palavra do nome em comum. Ganhos de outros
--     condutores sem ficha não saem daqui;
--   · contas Uber: as do motorista, as que podem ser dele pelo nome (sem a
--     ligação, cairiam nele por nome) e as de frota, estas sem nome;
--   · combustível, portagens e contratos: só os do motorista.

-- ── 0. "Este nome de plataforma pode ser deste motorista?" ─────────────────
-- Mais largo que isNameMatch (motoristaNomeMatching.ts) de propósito: tudo o que
-- ele aceita, isto aceita. Normaliza como normalizeName (norm_nome_match).
CREATE OR REPLACE FUNCTION public.nome_plataforma_pode_ser(p_plataforma text, p_oficial text)
RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- normalizeName também tira acentos decompostos (NFD), que o unaccent deixa.
  WITH n AS (
    SELECT regexp_replace(normalize(norm_nome_match(p_plataforma), NFD), '[̀-ͯ]', '', 'g') AS p,
           regexp_replace(normalize(norm_nome_match(p_oficial), NFD), '[̀-ͯ]', '', 'g') AS o
  )
  SELECT n.p <> '' AND n.o <> '' AND (
           position(n.p IN n.o) > 0
           OR position(n.o IN n.p) > 0
           OR EXISTS (
             SELECT 1 FROM unnest(string_to_array(n.p, ' ')) AS t(palavra)
              WHERE t.palavra NOT IN ('', 'da', 'de', 'do', 'das', 'dos', 'e')
                AND t.palavra = ANY (string_to_array(n.o, ' '))))
    FROM n;
$function$;

-- Só serve a função de baixo (dona postgres); ninguém mais precisa de a chamar.
REVOKE ALL ON FUNCTION public.nome_plataforma_pode_ser(text, text)
  FROM PUBLIC, anon, authenticated;

-- ── 1. Recurso ─────────────────────────────────────────────────────────────
-- Organizações novas herdam-no por ensure_base_cargos (Administrador recebe
-- todos os recursos). Os outros grupos configuram-se em Admin → Permissões.
INSERT INTO public.recursos (nome, descricao, categoria)
VALUES (
  'motoristas_resumos',
  'Ver o resumo da semana na aba Resumos da ficha do motorista',
  'Motoristas'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.cargo_permissoes (cargo_id, recurso_id, tem_acesso, pode_editar, org_id)
SELECT c.id, r.id, true, true, c.org_id
  FROM public.cargos c
  JOIN public.recursos r ON r.nome = 'motoristas_resumos'
 WHERE btrim(lower(c.nome)) = 'administrador'
   AND NOT EXISTS (
     SELECT 1 FROM public.cargo_permissoes cp
      WHERE cp.cargo_id = c.id AND cp.recurso_id = r.id
   );

-- ── 2. Dados da semana de um motorista ─────────────────────────────────────
-- SECURITY DEFINER salta a RLS: cada leitura filtra org_id à mão.
CREATE OR REPLACE FUNCTION public.resumo_semana_motorista_ficha(
  p_motorista_id uuid, p_inicio date, p_fim date
) RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org uuid := get_current_org_id();
  -- Mesmos limites que a lista manda pela REST ('…T00:00:00Z' / '…T23:59:59Z').
  v_ini_ts timestamptz := p_inicio::timestamp AT TIME ZONE 'UTC';
  v_fim_ts timestamptz := (p_fim::timestamp + interval '23:59:59') AT TIME ZONE 'UTC';
  v_nome text;
  v_bolt_id text;
  v_uber_uuid text;
BEGIN
  -- Uma semana (ou um mês) de cada vez: não é uma exportação do histórico.
  IF p_motorista_id IS NULL OR p_inicio IS NULL OR p_fim IS NULL
     OR p_fim < p_inicio OR p_fim - p_inicio > 31 THEN
    RAISE EXCEPTION 'periodo invalido' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT m.nome, m.bolt_id, m.uber_uuid INTO v_nome, v_bolt_id, v_uber_uuid
    FROM motoristas_ativos m
   WHERE m.id = p_motorista_id AND m.org_id = v_org;

  IF v_org IS NULL
     OR NOT FOUND
     OR NOT (
       can_view_financeiro()
       OR has_permission(auth.uid(), 'motoristas_resumos')
     )
  THEN
    RAISE EXCEPTION 'sem permissao para ver o resumo deste motorista'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN jsonb_build_object(
    'bolt_resumos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'motorista_id', b.motorista_id,
               'motorista_nome', b.motorista_nome,
               'liquido_a_pagar', b.liquido_a_pagar,
               'gorjetas', b.gorjetas,
               'viagens_terminadas', b.viagens_terminadas,
               'integracao_id', b.integracao_id,
               'identificador_motorista', b.identificador_motorista))
        FROM bolt_resumos_semanais b
       WHERE b.org_id = v_org
         AND b.periodo_inicio <= p_fim
         AND b.periodo_fim >= p_inicio
         AND (
           b.motorista_id = p_motorista_id
           OR (b.motorista_id IS NULL AND (
                 (v_bolt_id IS NOT NULL AND b.identificador_motorista = v_bolt_id)
                 OR nome_plataforma_pode_ser(b.motorista_nome, v_nome)))
         )
    ), '[]'::jsonb),

    -- As de frota só servem para as excluir: vão sem nome nem motorista.
    'uber_drivers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'uber_driver_id', u.uber_driver_id,
               'motorista_id', CASE WHEN u.is_conta_frota THEN NULL ELSE u.motorista_id END,
               'full_name', CASE WHEN u.is_conta_frota THEN NULL ELSE u.full_name END,
               'is_conta_frota', u.is_conta_frota))
        FROM uber_drivers u
       WHERE u.org_id = v_org
         AND (
           u.is_conta_frota
           OR u.motorista_id = p_motorista_id
           OR u.uber_driver_id = v_uber_uuid
           OR nome_plataforma_pode_ser(u.full_name, v_nome)
           OR EXISTS (
             SELECT 1 FROM uber_resumos_semanais ur
              WHERE ur.org_id = v_org
                AND ur.uber_driver_id = u.uber_driver_id
                AND ur.periodo_inicio <= p_fim
                AND ur.periodo_fim >= p_inicio
                AND nome_plataforma_pode_ser(ur.motorista_nome, v_nome))
         )
    ), '[]'::jsonb),

    'combustivel', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('motorista_id', t.motorista_id, 'amount', t.amount))
        FROM (
          SELECT motorista_id, amount FROM bp_transacoes
           WHERE org_id = v_org AND motorista_id = p_motorista_id
             AND transaction_date >= v_ini_ts AND transaction_date <= v_fim_ts
          UNION ALL
          SELECT motorista_id, amount FROM repsol_transacoes
           WHERE org_id = v_org AND motorista_id = p_motorista_id
             AND transaction_date >= v_ini_ts AND transaction_date <= v_fim_ts
          UNION ALL
          SELECT motorista_id, amount FROM edp_transacoes
           WHERE org_id = v_org AND motorista_id = p_motorista_id
             AND transaction_date >= v_ini_ts AND transaction_date <= v_fim_ts
        ) t
    ), '[]'::jsonb),

    'portagens', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('motorista_id', v.motorista_id, 'amount', v.amount))
        FROM via_verde_transacoes v
       WHERE v.org_id = v_org AND v.motorista_id = p_motorista_id
         AND v.transaction_date >= v_ini_ts AND v.transaction_date <= v_fim_ts
    ), '[]'::jsonb),

    -- Forma igual a COLUNAS_CONTRATO_PARA_PERIODO (periodosDoContrato.ts).
    'contratos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'viatura_id', c.viatura_id,
               'data_inicio', c.data_inicio,
               'data_fim', c.data_fim,
               'valor_total_manual', c.valor_total_manual,
               'preco_semana_acordado', c.preco_semana_acordado,
               'tarifa_id', c.tarifa_id,
               'regime', c.regime,
               'estado_operacional', c.estado_operacional,
               'substituido_em', c.substituido_em,
               'viaturas', CASE WHEN vi.id IS NULL THEN NULL ELSE jsonb_build_object(
                 'matricula', vi.matricula,
                 'grupo_id', vi.grupo_id,
                 'modelo_id', vi.modelo_id) END,
               'contrato_condutores', jsonb_build_array(
                 jsonb_build_object('motorista_id', p_motorista_id)),
               'cliente', CASE WHEN cl.id IS NULL THEN NULL ELSE jsonb_build_object(
                 'frota_parceira', cl.frota_parceira) END))
        FROM contratos_renting c
        LEFT JOIN viaturas vi ON vi.id = c.viatura_id AND vi.org_id = v_org
        LEFT JOIN clientes cl ON cl.id = c.cliente_id AND cl.org_id = v_org
       WHERE c.org_id = v_org
         AND c.deleted_at IS NULL
         AND c.data_inicio < ((p_fim + 1)::timestamp AT TIME ZONE 'UTC')
         AND (c.data_fim IS NULL OR c.data_fim >= v_ini_ts)
         AND EXISTS (
           SELECT 1 FROM contrato_condutores cc
            WHERE cc.contrato_id = c.id
              AND cc.org_id = v_org
              AND cc.motorista_id = p_motorista_id)
    ), '[]'::jsonb)
  );
END;
$function$;

COMMENT ON FUNCTION public.resumo_semana_motorista_ficha(uuid, date, date) IS
  'Linhas que a conta do resumo semanal precisa para um motorista (aba Resumos da ficha). Exige financeiro_recibos ou motoristas_resumos, e o motorista na org actual.';

-- Os default privileges dão EXECUTE a authenticated em cada função nova:
-- revogar nomeando os três antes de voltar a conceder.
REVOKE ALL ON FUNCTION public.resumo_semana_motorista_ficha(uuid, date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resumo_semana_motorista_ficha(uuid, date, date)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
