-- Os motoristas são pagos pelo ficheiro Bolt importado (Thiago, 2026-10-21).
-- Até aqui, numa conta ligada pela API (auth_mode = 'oauth'), o ficheiro só
-- trazia campanhas e extras, e a API escrevia os ganhos por cima de tudo
-- (e5f98b05, 14/08). Na semana 12/10 o WeGest mostrava 651,35 € ao Balraj e
-- o ficheiro 663,68 €; ao Cesar 368,60 € contra 394,50 €.
--
-- Os dois números nunca vão bater por inteiro: a API arruma a viagem pela
-- hora do pedido e o portal pela do pagamento, e há viagens que a API ainda
-- não tem com preço quando sincroniza. Por isso manda o ficheiro:
--   1. bolt_resumo_merge_csv escreve sempre os ganhos;
--   2. bolt_resumo_merge_api não pisa uma linha cujos ganhos vieram do
--      ficheiro (fonte_viagens = 'csv'); sem ficheiro, preenche como antes.
-- E (secção 4) um resumo Bolt/Uber sem identidade fica da ficha activa que
-- tem esse ID, em vez de entrar sem dono.
-- A semana 12/10, por pagar, foi acertada à parte com o ficheiro já
-- importado: scripts/bolt_semana_12_10_pelo_ficheiro_2026-10-21.sql.
--
-- O "Ganhos líquidos" do ficheiro é bruto − taxas e o bruto já traz a
-- campanha (687 linhas verificadas), por isso liquido_a_pagar só soma a
-- campanha quando fonte_viagens = 'api': com o ficheiro não há duplicação.

-- ============================================================================
-- 1. Números do ficheiro, como o parseNumber do bolt-import-csv
-- ============================================================================

create or replace function public.bolt_csv_numero(p_valor text)
returns numeric
language plpgsql
immutable
set search_path to ''
as $function$
declare
  v text := regexp_replace(coalesce(p_valor, ''), '\s', '', 'g');
begin
  if v = '' or v = '-' then
    return 0;
  end if;
  if v like '%,%' and v like '%.%' then
    v := replace(replace(v, '.', ''), ',', '.');
  elsif v like '%,%' then
    v := replace(v, ',', '.');
  end if;
  return v::numeric;
exception when others then
  return 0;
end;
$function$;

revoke all on function public.bolt_csv_numero(text) from public, anon, authenticated;

-- ============================================================================
-- 2. O ficheiro escreve sempre os ganhos
-- ============================================================================
-- Redefinição integral; saem as duas guardas que davam a semana à API
-- (auth_mode = 'oauth' e "API sincronizada depois do ficheiro").

create or replace function public.bolt_resumo_merge_csv(
  p_integracao_id uuid,
  p_org_id uuid,
  p_periodo_inicio date,
  p_periodo_fim date,
  p_valores jsonb,
  p_periodo text default null::text,
  p_motorista_id uuid default null::uuid,
  p_escrever_viagens boolean default null::boolean,
  p_importado_em timestamp with time zone default now()
)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_rec             public.bolt_resumos_semanais%ROWTYPE;
  v_linha           public.bolt_resumos_semanais%ROWTYPE;
  v_chave           text;
  v_periodo         text;
  v_org             uuid;
  v_id              uuid;
  v_linhas          integer := 0;
  v_traz_viagens    boolean;
  v_escreve_viagens boolean;
  v_quando          timestamptz := COALESCE(p_importado_em, now());
BEGIN
  IF p_integracao_id IS NULL THEN
    RAISE EXCEPTION 'bolt_resumo_merge_csv: p_integracao_id e obrigatorio.';
  END IF;
  IF p_periodo_inicio IS NULL OR p_periodo_fim IS NULL THEN
    RAISE EXCEPTION 'bolt_resumo_merge_csv: p_periodo_inicio e p_periodo_fim sao obrigatorios.';
  END IF;

  v_rec := jsonb_populate_record(NULL::public.bolt_resumos_semanais, COALESCE(p_valores, '{}'::jsonb));

  v_periodo := COALESCE(
    NULLIF(btrim(p_periodo), ''),
    to_char(p_periodo_inicio, 'YYYY-MM-DD') || ' a ' || to_char(p_periodo_fim, 'YYYY-MM-DD')
  );

  v_chave := COALESCE(
    NULLIF(btrim(v_rec.chave_motorista), ''),
    NULLIF(btrim(v_rec.identificador_motorista), ''),
    NULLIF(lower(btrim(v_rec.email)), ''),
    public.bolt_normalizar_nome(v_rec.motorista_nome)
  );
  IF v_chave IS NULL THEN
    RAISE EXCEPTION
      'bolt_resumo_merge_csv: linha sem identificador, email ou nome (integracao %, periodo %).',
      p_integracao_id, v_periodo;
  END IF;

  SELECT org_id INTO v_org
    FROM public.plataformas_configuracao
   WHERE id = p_integracao_id;

  IF v_org IS NULL THEN
    v_org := p_org_id;
  ELSIF p_org_id IS NOT NULL AND p_org_id <> v_org THEN
    RAISE EXCEPTION
      'bolt_resumo_merge_csv: p_org_id (%) nao e a org da integracao % (%).',
      p_org_id, p_integracao_id, v_org;
  END IF;

  IF v_org IS NULL THEN
    RAISE EXCEPTION
      'bolt_resumo_merge_csv: sem org_id para a integracao %.',
      p_integracao_id;
  END IF;

  v_traz_viagens := COALESCE(
    p_valores ?| ARRAY[
      'ganhos_brutos_app', 'ganhos_brutos_dinheiro', 'gorjetas', 'taxas_cancelamento',
      'comissoes', 'portagens', 'taxas_reserva', 'viagens_terminadas',
      'distancia_total_km', 'distancia_media_km'
    ],
    false
  );
  -- O ficheiro é o que se paga: escreve os ganhos sempre que os traz.
  v_escreve_viagens := COALESCE(p_escrever_viagens, v_traz_viagens);

  SELECT * INTO v_linha
    FROM public.bolt_resumos_semanais
   WHERE integracao_id = p_integracao_id
     AND periodo = v_periodo
     AND chave_motorista = v_chave
   FOR UPDATE;

  IF v_linha.id IS NULL THEN
    INSERT INTO public.bolt_resumos_semanais (
      integracao_id, org_id, periodo, periodo_inicio, periodo_fim,
      chave_motorista, identificador_motorista, identificador_individual,
      motorista_nome, email, telefone, motorista_id,
      ganhos_campanha, reembolsos_despesas,
      iva_ganhos_app, iva_ganhos_dinheiro, iva_taxas_cancelamento, iva_taxas_reserva,
      dinheiro_recebido, total_taxas, outras_taxas, reembolsos_passageiros,
      ganhos_liquidos, pagamento_previsto, ganhos_brutos_hora, ganhos_liquidos_hora,
      desconto_comissao_app, desconto_comissao_dinheiro,
      nivel, categorias_ativas, viagens_dinheiro_ativadas, pontuacao_motorista,
      taxa_aceitacao, tempo_online_min, utilizacao,
      taxa_finalizacao_todas, taxa_finalizacao_aceites, classificacao_media,
      raw_data,
      ganhos_brutos_app, ganhos_brutos_dinheiro, gorjetas, taxas_cancelamento,
      comissoes, portagens, taxas_reserva,
      viagens_terminadas, distancia_total_km, distancia_media_km,
      fonte_viagens, fonte_extras, csv_importado_em, updated_at
    ) VALUES (
      p_integracao_id, v_org, v_periodo, p_periodo_inicio, p_periodo_fim,
      v_chave,
      NULLIF(btrim(v_rec.identificador_motorista), ''),
      NULLIF(btrim(v_rec.identificador_individual), ''),
      NULLIF(btrim(v_rec.motorista_nome), ''),
      NULLIF(lower(btrim(v_rec.email)), ''),
      NULLIF(btrim(v_rec.telefone), ''),
      COALESCE(p_motorista_id, v_rec.motorista_id),
      COALESCE(v_rec.ganhos_campanha, 0), COALESCE(v_rec.reembolsos_despesas, 0),
      COALESCE(v_rec.iva_ganhos_app, 0), COALESCE(v_rec.iva_ganhos_dinheiro, 0),
      COALESCE(v_rec.iva_taxas_cancelamento, 0), COALESCE(v_rec.iva_taxas_reserva, 0),
      COALESCE(v_rec.dinheiro_recebido, 0), COALESCE(v_rec.total_taxas, 0),
      COALESCE(v_rec.outras_taxas, 0), COALESCE(v_rec.reembolsos_passageiros, 0),
      COALESCE(v_rec.ganhos_liquidos, 0), COALESCE(v_rec.pagamento_previsto, 0),
      COALESCE(v_rec.ganhos_brutos_hora, 0), COALESCE(v_rec.ganhos_liquidos_hora, 0),
      COALESCE(v_rec.desconto_comissao_app, 0), COALESCE(v_rec.desconto_comissao_dinheiro, 0),
      v_rec.nivel, v_rec.categorias_ativas, v_rec.viagens_dinheiro_ativadas,
      COALESCE(v_rec.pontuacao_motorista, 0), COALESCE(v_rec.taxa_aceitacao, 0),
      COALESCE(v_rec.tempo_online_min, 0), COALESCE(v_rec.utilizacao, 0),
      COALESCE(v_rec.taxa_finalizacao_todas, 0), COALESCE(v_rec.taxa_finalizacao_aceites, 0),
      COALESCE(v_rec.classificacao_media, 0),
      v_rec.raw_data,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.ganhos_brutos_app, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.ganhos_brutos_dinheiro, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.gorjetas, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.taxas_cancelamento, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.comissoes, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.portagens, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.taxas_reserva, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.viagens_terminadas, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.distancia_total_km, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.distancia_media_km, 0) ELSE 0 END,
      CASE WHEN v_escreve_viagens THEN 'csv' ELSE NULL END,
      'csv', v_quando, now()
    )
    ON CONFLICT (integracao_id, periodo, chave_motorista) DO NOTHING
    RETURNING id INTO v_id;

    GET DIAGNOSTICS v_linhas = ROW_COUNT;
  END IF;

  IF v_id IS NULL THEN
    UPDATE public.bolt_resumos_semanais SET
      org_id                  = COALESCE(org_id, v_org),
      periodo_inicio          = COALESCE(p_periodo_inicio, periodo_inicio),
      periodo_fim             = COALESCE(p_periodo_fim, periodo_fim),
      identificador_motorista = COALESCE(NULLIF(btrim(v_rec.identificador_motorista), ''), identificador_motorista),
      identificador_individual = COALESCE(NULLIF(btrim(v_rec.identificador_individual), ''), identificador_individual),
      motorista_nome          = COALESCE(NULLIF(btrim(v_rec.motorista_nome), ''), motorista_nome),
      email                   = COALESCE(NULLIF(lower(btrim(v_rec.email)), ''), email),
      telefone                = COALESCE(NULLIF(btrim(v_rec.telefone), ''), telefone),
      motorista_id            = COALESCE(motorista_id, p_motorista_id, v_rec.motorista_id),

      ganhos_campanha            = COALESCE(v_rec.ganhos_campanha, ganhos_campanha),
      reembolsos_despesas        = COALESCE(v_rec.reembolsos_despesas, reembolsos_despesas),
      iva_ganhos_app             = COALESCE(v_rec.iva_ganhos_app, iva_ganhos_app),
      iva_ganhos_dinheiro        = COALESCE(v_rec.iva_ganhos_dinheiro, iva_ganhos_dinheiro),
      iva_taxas_cancelamento     = COALESCE(v_rec.iva_taxas_cancelamento, iva_taxas_cancelamento),
      iva_taxas_reserva          = COALESCE(v_rec.iva_taxas_reserva, iva_taxas_reserva),
      dinheiro_recebido          = COALESCE(v_rec.dinheiro_recebido, dinheiro_recebido),
      total_taxas                = COALESCE(v_rec.total_taxas, total_taxas),
      outras_taxas               = COALESCE(v_rec.outras_taxas, outras_taxas),
      reembolsos_passageiros     = COALESCE(v_rec.reembolsos_passageiros, reembolsos_passageiros),
      ganhos_liquidos            = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.ganhos_liquidos, ganhos_liquidos) ELSE ganhos_liquidos END,
      pagamento_previsto         = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.pagamento_previsto, pagamento_previsto) ELSE pagamento_previsto END,
      ganhos_brutos_hora         = COALESCE(v_rec.ganhos_brutos_hora, ganhos_brutos_hora),
      ganhos_liquidos_hora       = COALESCE(v_rec.ganhos_liquidos_hora, ganhos_liquidos_hora),
      desconto_comissao_app      = COALESCE(v_rec.desconto_comissao_app, desconto_comissao_app),
      desconto_comissao_dinheiro = COALESCE(v_rec.desconto_comissao_dinheiro, desconto_comissao_dinheiro),
      nivel                      = COALESCE(v_rec.nivel, nivel),
      categorias_ativas          = COALESCE(v_rec.categorias_ativas, categorias_ativas),
      viagens_dinheiro_ativadas  = COALESCE(v_rec.viagens_dinheiro_ativadas, viagens_dinheiro_ativadas),
      pontuacao_motorista        = COALESCE(v_rec.pontuacao_motorista, pontuacao_motorista),
      taxa_aceitacao             = COALESCE(v_rec.taxa_aceitacao, taxa_aceitacao),
      tempo_online_min           = COALESCE(v_rec.tempo_online_min, tempo_online_min),
      utilizacao                 = COALESCE(v_rec.utilizacao, utilizacao),
      taxa_finalizacao_todas     = COALESCE(v_rec.taxa_finalizacao_todas, taxa_finalizacao_todas),
      taxa_finalizacao_aceites   = COALESCE(v_rec.taxa_finalizacao_aceites, taxa_finalizacao_aceites),
      classificacao_media        = COALESCE(v_rec.classificacao_media, classificacao_media),
      raw_data                   = COALESCE(v_rec.raw_data, raw_data),

      ganhos_brutos_app      = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.ganhos_brutos_app, ganhos_brutos_app) ELSE ganhos_brutos_app END,
      ganhos_brutos_dinheiro = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.ganhos_brutos_dinheiro, ganhos_brutos_dinheiro) ELSE ganhos_brutos_dinheiro END,
      gorjetas               = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.gorjetas, gorjetas) ELSE gorjetas END,
      taxas_cancelamento     = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.taxas_cancelamento, taxas_cancelamento) ELSE taxas_cancelamento END,
      comissoes              = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.comissoes, comissoes) ELSE comissoes END,
      portagens              = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.portagens, portagens) ELSE portagens END,
      taxas_reserva          = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.taxas_reserva, taxas_reserva) ELSE taxas_reserva END,
      viagens_terminadas     = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.viagens_terminadas, viagens_terminadas) ELSE viagens_terminadas END,
      distancia_total_km     = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.distancia_total_km, distancia_total_km) ELSE distancia_total_km END,
      distancia_media_km     = CASE WHEN v_escreve_viagens THEN COALESCE(v_rec.distancia_media_km, distancia_media_km) ELSE distancia_media_km END,
      fonte_viagens          = CASE WHEN v_escreve_viagens THEN 'csv' ELSE fonte_viagens END,

      fonte_extras           = 'csv',
      csv_importado_em       = v_quando,
      updated_at             = now()
    WHERE integracao_id = p_integracao_id
      AND periodo = v_periodo
      AND chave_motorista = v_chave
    RETURNING id INTO v_id;

    GET DIAGNOSTICS v_linhas = ROW_COUNT;
  END IF;

  IF v_id IS NOT NULL THEN
    PERFORM public.bolt_resumo_recalcular_total(v_id);
  END IF;

  RETURN v_linhas;
END;
$function$;

-- ============================================================================
-- 3. A API não pisa ganhos que vieram do ficheiro
-- ============================================================================
-- Redefinição integral; as colunas de dinheiro e a fonte ficam como estão
-- quando a linha já tem os ganhos do ficheiro. As api_* actualizam sempre,
-- para se poder comparar.

create or replace function public.bolt_resumo_merge_api(
  p_integracao_id uuid, p_org_id uuid, p_periodo_inicio date, p_periodo_fim date,
  p_identificador_motorista text default null::text, p_motorista_nome text default null::text,
  p_email text default null::text, p_telefone text default null::text,
  p_motorista_id uuid default null::uuid, p_periodo text default null::text,
  p_ganhos_brutos_app numeric default 0, p_ganhos_brutos_dinheiro numeric default 0,
  p_gorjetas numeric default 0, p_taxas_cancelamento numeric default 0,
  p_comissoes numeric default 0, p_portagens numeric default 0, p_taxas_reserva numeric default 0,
  p_viagens_terminadas integer default 0, p_distancia_total_km numeric default 0,
  p_distancia_media_km numeric default 0,
  p_api_ride_price numeric default null::numeric, p_api_booking_fee numeric default null::numeric,
  p_api_toll_fee numeric default null::numeric, p_api_cancellation_fee numeric default null::numeric,
  p_api_tip numeric default null::numeric, p_api_net_earnings numeric default null::numeric,
  p_api_cash_discount numeric default null::numeric, p_api_in_app_discount numeric default null::numeric,
  p_api_commission numeric default null::numeric, p_api_orders_total integer default null::integer,
  p_api_orders_finished integer default null::integer, p_api_orders_cash integer default null::integer,
  p_api_ride_distance numeric default null::numeric
)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE v_chave text; v_periodo text; v_org uuid; v_id uuid; v_linhas integer;
BEGIN
  IF p_integracao_id IS NULL THEN
    RAISE EXCEPTION 'bolt_resumo_merge_api: p_integracao_id e obrigatorio.'; END IF;
  IF p_periodo_inicio IS NULL OR p_periodo_fim IS NULL THEN
    RAISE EXCEPTION 'bolt_resumo_merge_api: periodo_inicio e periodo_fim sao obrigatorios.'; END IF;

  v_periodo := COALESCE(NULLIF(btrim(p_periodo),''),
    to_char(p_periodo_inicio,'YYYY-MM-DD') || ' a ' || to_char(p_periodo_fim,'YYYY-MM-DD'));

  v_chave := COALESCE(NULLIF(btrim(p_identificador_motorista),''),
                      NULLIF(lower(btrim(p_email)),''),
                      public.bolt_normalizar_nome(p_motorista_nome));
  IF v_chave IS NULL THEN
    RAISE EXCEPTION 'bolt_resumo_merge_api: motorista sem identificador, email ou nome (integracao %, periodo %).',
      p_integracao_id, v_periodo; END IF;

  SELECT org_id INTO v_org FROM public.plataformas_configuracao WHERE id = p_integracao_id;
  IF v_org IS NULL THEN v_org := p_org_id;
  ELSIF p_org_id IS NOT NULL AND p_org_id <> v_org THEN
    RAISE EXCEPTION 'bolt_resumo_merge_api: p_org_id (%) nao e a org da integracao % (%).',
      p_org_id, p_integracao_id, v_org; END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'bolt_resumo_merge_api: sem org_id para a integracao %.', p_integracao_id; END IF;

  INSERT INTO public.bolt_resumos_semanais AS r (
    integracao_id, org_id, periodo, periodo_inicio, periodo_fim,
    chave_motorista, identificador_motorista, motorista_nome, email, telefone, motorista_id,
    ganhos_brutos_app, ganhos_brutos_dinheiro, gorjetas, taxas_cancelamento,
    comissoes, portagens, taxas_reserva, viagens_terminadas, distancia_total_km, distancia_media_km,
    ganhos_liquidos, pagamento_previsto,
    api_ride_price, api_booking_fee, api_toll_fee, api_cancellation_fee, api_tip,
    api_net_earnings, api_cash_discount, api_in_app_discount, api_commission,
    api_orders_total, api_orders_finished, api_orders_cash, api_ride_distance,
    fonte_viagens, api_sincronizado_em, updated_at
  ) VALUES (
    p_integracao_id, v_org, v_periodo, p_periodo_inicio, p_periodo_fim,
    v_chave, NULLIF(btrim(p_identificador_motorista),''), NULLIF(btrim(p_motorista_nome),''),
    NULLIF(lower(btrim(p_email)),''), NULLIF(btrim(p_telefone),''), p_motorista_id,
    COALESCE(p_ganhos_brutos_app,0), COALESCE(p_ganhos_brutos_dinheiro,0),
    COALESCE(p_gorjetas,0), COALESCE(p_taxas_cancelamento,0), COALESCE(p_comissoes,0),
    COALESCE(p_portagens,0), COALESCE(p_taxas_reserva,0), COALESCE(p_viagens_terminadas,0),
    COALESCE(p_distancia_total_km,0), COALESCE(p_distancia_media_km,0),
    p_api_net_earnings, p_api_net_earnings,
    p_api_ride_price, p_api_booking_fee, p_api_toll_fee, p_api_cancellation_fee, p_api_tip,
    p_api_net_earnings, p_api_cash_discount, p_api_in_app_discount, p_api_commission,
    p_api_orders_total, p_api_orders_finished, p_api_orders_cash, p_api_ride_distance,
    'api', now(), now()
  )
  ON CONFLICT (integracao_id, periodo, chave_motorista) DO UPDATE SET
    org_id = COALESCE(r.org_id, EXCLUDED.org_id),
    periodo_inicio = COALESCE(EXCLUDED.periodo_inicio, r.periodo_inicio),
    periodo_fim = COALESCE(EXCLUDED.periodo_fim, r.periodo_fim),
    identificador_motorista = COALESCE(r.identificador_motorista, EXCLUDED.identificador_motorista),
    motorista_nome = COALESCE(EXCLUDED.motorista_nome, r.motorista_nome),
    email = COALESCE(EXCLUDED.email, r.email),
    telefone = COALESCE(EXCLUDED.telefone, r.telefone),
    motorista_id = COALESCE(r.motorista_id, EXCLUDED.motorista_id),
    -- Ganhos do ficheiro mandam: a API só os escreve numa linha sem ficheiro.
    ganhos_brutos_app = CASE WHEN r.fonte_viagens = 'csv' THEN r.ganhos_brutos_app ELSE EXCLUDED.ganhos_brutos_app END,
    ganhos_brutos_dinheiro = CASE WHEN r.fonte_viagens = 'csv' THEN r.ganhos_brutos_dinheiro ELSE EXCLUDED.ganhos_brutos_dinheiro END,
    gorjetas = CASE WHEN r.fonte_viagens = 'csv' THEN r.gorjetas ELSE EXCLUDED.gorjetas END,
    taxas_cancelamento = CASE WHEN r.fonte_viagens = 'csv' THEN r.taxas_cancelamento ELSE EXCLUDED.taxas_cancelamento END,
    comissoes = CASE WHEN r.fonte_viagens = 'csv' THEN r.comissoes ELSE EXCLUDED.comissoes END,
    portagens = CASE WHEN r.fonte_viagens = 'csv' THEN r.portagens ELSE EXCLUDED.portagens END,
    taxas_reserva = CASE WHEN r.fonte_viagens = 'csv' THEN r.taxas_reserva ELSE EXCLUDED.taxas_reserva END,
    ganhos_liquidos = CASE WHEN r.fonte_viagens = 'csv' THEN r.ganhos_liquidos
                           ELSE COALESCE(EXCLUDED.ganhos_liquidos, r.ganhos_liquidos) END,
    pagamento_previsto = CASE WHEN r.fonte_viagens = 'csv' THEN r.pagamento_previsto
                              ELSE COALESCE(EXCLUDED.pagamento_previsto, r.pagamento_previsto) END,
    -- Contagens e distâncias não são dinheiro: a API completa o que o ficheiro não traz.
    viagens_terminadas = EXCLUDED.viagens_terminadas,
    distancia_total_km = EXCLUDED.distancia_total_km,
    distancia_media_km = EXCLUDED.distancia_media_km,
    api_ride_price = EXCLUDED.api_ride_price,
    api_booking_fee = EXCLUDED.api_booking_fee,
    api_toll_fee = EXCLUDED.api_toll_fee,
    api_cancellation_fee = EXCLUDED.api_cancellation_fee,
    api_tip = EXCLUDED.api_tip,
    api_net_earnings = EXCLUDED.api_net_earnings,
    api_cash_discount = EXCLUDED.api_cash_discount,
    api_in_app_discount = EXCLUDED.api_in_app_discount,
    api_commission = EXCLUDED.api_commission,
    api_orders_total = EXCLUDED.api_orders_total,
    api_orders_finished = EXCLUDED.api_orders_finished,
    api_orders_cash = EXCLUDED.api_orders_cash,
    api_ride_distance = EXCLUDED.api_ride_distance,
    fonte_viagens = CASE WHEN r.fonte_viagens = 'csv' THEN 'csv' ELSE 'api' END,
    api_sincronizado_em = now(), updated_at = now()
  RETURNING r.id INTO v_id;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  IF v_id IS NOT NULL THEN PERFORM public.bolt_resumo_recalcular_total(v_id); END IF;
  RETURN v_linhas;
END;
$function$;

-- ============================================================================
-- 4. Resumo sem identidade fica da ficha que tem esse ID
-- ============================================================================
-- 31 fichas (Década e Premium) tinham o ID Bolt/Uber gravado mas nenhuma
-- identidade: o gatilho da ficha só nasceu a 01/10 e só reage quando o ID
-- muda. Os resumos entravam sem dono e a ficha do motorista mostrava 0
-- (Carolino Duarte, 356,77 € de Bolt em 4 semanas). Antes de tentar pelo
-- nome, o ID numa única ficha activa decide, e a identidade nasce aí.
-- Redefinição integral; o resto fica igual.

create or replace function public.tg_resolver_motorista_plataforma()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_id         text;
  v_nome       text;
  v_resolvido  uuid;
  v_candidatos uuid[];
BEGIN
  v_id := CASE TG_ARGV[0]
            WHEN 'bolt' THEN to_jsonb(NEW) ->> 'identificador_motorista'
            ELSE to_jsonb(NEW) ->> 'uber_driver_id'
          END;

  v_resolvido := public.resolver_motorista_por_plataforma(NEW.org_id, TG_ARGV[0], v_id);

  -- Sem identidade, mas o ID está numa ficha activa (uma só): é dela.
  IF v_resolvido IS NULL AND v_id IS NOT NULL AND v_id <> '' THEN
    SELECT array_agg(m.id) INTO v_candidatos
      FROM public.motoristas_ativos m
     WHERE m.org_id = NEW.org_id
       AND m.status_ativo IS DISTINCT FROM false
       AND ((TG_ARGV[0] = 'bolt' AND m.bolt_id = v_id)
            OR (TG_ARGV[0] = 'uber' AND m.uber_uuid = v_id));

    IF array_length(v_candidatos, 1) = 1 THEN
      BEGIN
        INSERT INTO public.motorista_plataforma_identidades
          (org_id, motorista_id, plataforma, identificador, origem)
        VALUES (NEW.org_id, v_candidatos[1], TG_ARGV[0], v_id, 'ficha')
        ON CONFLICT DO NOTHING;
        v_resolvido := v_candidatos[1];
      EXCEPTION WHEN check_violation THEN
        -- Conta da própria frota: não é de motorista nenhum.
        v_resolvido := NULL;
      END;
    END IF;
    v_candidatos := NULL;
  END IF;

  -- Identificador desconhecido: tenta pelo nome, e só com nome igual e único.
  IF v_resolvido IS NULL AND v_id IS NOT NULL AND v_id <> '' THEN
    v_nome := to_jsonb(NEW) ->> 'motorista_nome';

    IF v_nome IS NOT NULL AND public.norm_nome_match(v_nome) <> '' THEN
      SELECT array_agg(m.id) INTO v_candidatos
      FROM public.motoristas_ativos m
      WHERE m.org_id = NEW.org_id
        AND public.norm_nome_match(m.nome) = public.norm_nome_match(v_nome);

      -- Exactamente um: com dois homónimos não se adivinha.
      IF array_length(v_candidatos, 1) = 1 THEN
        v_resolvido := v_candidatos[1];
        INSERT INTO public.motorista_plataforma_identidades
          (org_id, motorista_id, plataforma, identificador, origem)
        VALUES (NEW.org_id, v_resolvido, TG_ARGV[0], v_id, 'auto_nome')
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  END IF;

  IF v_resolvido IS NOT NULL OR TG_OP = 'INSERT' OR public.recalculo_e_forcado() THEN
    NEW.motorista_id := v_resolvido;
  ELSE
    NEW.motorista_id := OLD.motorista_id;
  END IF;

  RETURN NEW;
END $function$;

revoke all on function public.tg_resolver_motorista_plataforma() from public, anon, authenticated;

notify pgrst, 'reload schema';
