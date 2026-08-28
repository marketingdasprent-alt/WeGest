-- ============================================================
-- Bolt: um só valor canónico, venha da API ou do CSV
-- ============================================================
-- O PROBLEMA
-- Havia duas verdades para o mesmo dinheiro e um interruptor a escolher qual:
--
--   CSV  → bolt_resumos_semanais.ganhos_liquidos
--   API  → bolt_resumos_semanais.api_net_earnings  (coluna à parte)
--
-- O merge da API preenchia as colunas api_* e NUNCA tocava em
-- `ganhos_liquidos`. Os ecrãs financeiros lêem `ganhos_liquidos`, por isso
-- continuavam a mostrar o valor do CSV mesmo depois de a API ter trazido a
-- semana toda. Para a Anabela Gonçalves na semana 03/08: o ecrã mostrava
-- 100,60 € (CSV) enquanto a API dizia 140,45 €.
--
-- Virar o interruptor para 'api' não resolvia — piorava: nesse modo os ecrãs
-- passam a ler bolt_viagens.driver_earnings, que está a NULL de propósito, e
-- a receita Bolt ia toda a ZERO.
--
-- A CORRECÇÃO
-- `ganhos_liquidos` passa a ser o campo canónico, escrito pelos DOIS
-- caminhos. Quem lê deixa de precisar de saber a origem — é sempre o mesmo
-- campo, com o mesmo significado.
--
-- Precedência: quando a API tem dados para a semana, é ela que manda; o CSV
-- só preenche o que a API não sabe. Isso mantém-se para os outros campos.
--
-- O QUE O CSV CONTINUA A POSSUIR
-- `ganhos_campanha` (20.457,77 € em 803 linhas) e `reembolsos_despesas`. A
-- API não os devolve — não existem em lado nenhum do getFleetOrders. São
-- somados por cima, nunca substituídos, e é por isso que passar a API a dona
-- do líquido não os apaga.
-- ============================================================

CREATE OR REPLACE FUNCTION public.bolt_resumo_merge_api(
  p_integracao_id uuid, p_org_id uuid, p_periodo_inicio date, p_periodo_fim date,
  p_identificador_motorista text DEFAULT NULL, p_motorista_nome text DEFAULT NULL,
  p_email text DEFAULT NULL, p_telefone text DEFAULT NULL, p_motorista_id uuid DEFAULT NULL,
  p_periodo text DEFAULT NULL, p_ganhos_brutos_app numeric DEFAULT 0,
  p_ganhos_brutos_dinheiro numeric DEFAULT 0, p_gorjetas numeric DEFAULT 0,
  p_taxas_cancelamento numeric DEFAULT 0, p_comissoes numeric DEFAULT 0,
  p_portagens numeric DEFAULT 0, p_taxas_reserva numeric DEFAULT 0,
  p_viagens_terminadas integer DEFAULT 0, p_distancia_total_km numeric DEFAULT 0,
  p_distancia_media_km numeric DEFAULT 0, p_api_ride_price numeric DEFAULT NULL,
  p_api_booking_fee numeric DEFAULT NULL, p_api_toll_fee numeric DEFAULT NULL,
  p_api_cancellation_fee numeric DEFAULT NULL, p_api_tip numeric DEFAULT NULL,
  p_api_net_earnings numeric DEFAULT NULL, p_api_cash_discount numeric DEFAULT NULL,
  p_api_in_app_discount numeric DEFAULT NULL, p_api_commission numeric DEFAULT NULL,
  p_api_orders_total integer DEFAULT NULL, p_api_orders_finished integer DEFAULT NULL,
  p_api_orders_cash integer DEFAULT NULL, p_api_ride_distance numeric DEFAULT NULL)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- CANÓNICO: o líquido da API. Antes ficava por preencher e o ecrã via o
    -- valor do CSV (ou nada, nas semanas que só a API trouxe).
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
    ganhos_brutos_app = EXCLUDED.ganhos_brutos_app,
    ganhos_brutos_dinheiro = EXCLUDED.ganhos_brutos_dinheiro,
    gorjetas = EXCLUDED.gorjetas,
    taxas_cancelamento = EXCLUDED.taxas_cancelamento,
    comissoes = EXCLUDED.comissoes,
    portagens = EXCLUDED.portagens,
    taxas_reserva = EXCLUDED.taxas_reserva,
    viagens_terminadas = EXCLUDED.viagens_terminadas,
    distancia_total_km = EXCLUDED.distancia_total_km,
    distancia_media_km = EXCLUDED.distancia_media_km,
    -- A API passa a ser dona do líquido. COALESCE para não apagar o valor do
    -- CSV nas linhas em que a API não devolveu net_earnings.
    ganhos_liquidos = COALESCE(EXCLUDED.ganhos_liquidos, r.ganhos_liquidos),
    pagamento_previsto = COALESCE(EXCLUDED.pagamento_previsto, r.pagamento_previsto),
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
    fonte_viagens = 'api', api_sincronizado_em = now(), updated_at = now()
  RETURNING r.id INTO v_id;

  GET DIAGNOSTICS v_linhas = ROW_COUNT;
  IF v_id IS NOT NULL THEN PERFORM public.bolt_resumo_recalcular_total(v_id); END IF;
  RETURN v_linhas;
END;
$function$;

COMMENT ON FUNCTION public.bolt_resumo_merge_api IS
  'Merge por fonte do resumo semanal Bolt. A API é dona das viagens E do líquido '
  '(ganhos_liquidos/pagamento_previsto); o CSV é dono de ganhos_campanha e '
  'reembolsos_despesas, que a API não devolve. ganhos_liquidos é o campo canónico '
  'que os ecrãs lêem, venha de onde vier. Ver migração 20260813210000.';

-- Backfill: as linhas que a API já trouxe mas cujo líquido ficou preso ao CSV.
UPDATE public.bolt_resumos_semanais
   SET ganhos_liquidos = api_net_earnings,
       pagamento_previsto = api_net_earnings,
       updated_at = now()
 WHERE fonte_viagens = 'api'
   AND api_net_earnings IS NOT NULL
   AND ganhos_liquidos IS DISTINCT FROM api_net_earnings;
