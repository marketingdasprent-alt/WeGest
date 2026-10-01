-- ============================================================================
-- Gatilho: custo importado que não colou a nenhuma viatura
-- ============================================================================
--
-- Combustível e portagens entram por importação e ficam ligados a uma viatura
-- (e daí a um motorista). Quando o cartão ou a matrícula não estão mapeados, a
-- linha entra na mesma — só que não é imputada a ninguém e ninguém dá por isso.
--
-- Medido a 2026-09-07, últimos 30 dias: 1 604 transacções, 56 165,64 €, de
-- EDP, Repsol e Via Verde. A BP tem tudo atribuído.
--
-- POR QUE É UM RESUMO POR ORGANIZAÇÃO E NÃO UM EVENTO POR TRANSACÇÃO
--
-- 1 604 eventos seria uma enxurrada, e a transacção não é a unidade sobre a
-- qual se age: corrige-se o MAPEAMENTO, uma vez, e as linhas todas passam a
-- colar. Agrupar por cartão também não serve — só a `bp_transacoes` tem
-- `card_id` e só a `via_verde_transacoes` tem `matricula`; a Repsol e a EDP
-- não têm coluna nenhuma que sirva de chave, e são a maior parte do problema.
--
-- `entity_table`/`entity_id` são NOT NULL, por isso o evento ancora-se na
-- própria organização. Isso dá também a deduplicação que se quer: um evento
-- aberto por org de cada vez.
--
-- A janela de 30 dias é deslizante — a pergunta a que responde é "quanto custo
-- está por imputar agora", não "o que entrou hoje". O ritmo do aviso é depois
-- do `cooldown_minutos` da regra.
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."emit_custos_sem_viatura_events"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  with por_imputar as (
    select org_id, amount, 'BP' as origem
      from public.bp_transacoes
     where viatura_id is null and transaction_date > now() - interval '30 days'
    union all
    select org_id, amount, 'Repsol'
      from public.repsol_transacoes
     where viatura_id is null and transaction_date > now() - interval '30 days'
    union all
    select org_id, amount, 'EDP'
      from public.edp_transacoes
     where viatura_id is null and transaction_date > now() - interval '30 days'
    union all
    select org_id, amount, 'Via Verde'
      from public.via_verde_transacoes
     where viatura_id is null and transaction_date > now() - interval '30 days'
  ),
  por_org as (
    select
      org_id,
      count(*)::int as transacoes,
      round(sum(amount)::numeric, 2) as valor,
      string_agg(distinct origem, ', ' order by origem) as origens
    from por_imputar
    where org_id is not null
    group by org_id
  )
  select
    o.org_id,
    'custo.sem_viatura',
    'organizacoes',
    o.org_id,
    jsonb_build_object(
      'transacoes', o.transacoes,
      'valor', o.valor,
      'origens', o.origens,
      'dias', 30
    ),
    'cron'
  from por_org o
  where o.transacoes > 0
    and not exists (
      select 1 from public.domain_events d
      where d.entity_table = 'organizacoes'
        and d.entity_id = o.org_id
        and d.event_type = 'custo.sem_viatura'
        and d.processed_at is null
    );
end;
$$;

COMMENT ON FUNCTION "public"."emit_custos_sem_viatura_events"() IS
  'Emite custo.sem_viatura: resumo por organizacao das transacoes de combustivel/portagens dos ultimos 30 dias que nao ficaram ligadas a nenhuma viatura. Um evento por org, nao por transacao — o que se corrige e o mapeamento.';

-- Corre sem sessão (cron): fora do alcance de quem não tem sessão nenhuma.
REVOKE ALL ON FUNCTION "public"."emit_custos_sem_viatura_events"() FROM PUBLIC, anon;

SELECT cron.schedule(
  'automation-emit-custos-sem-viatura-diario',
  '0 8 * * *',
  $$select public.emit_custos_sem_viatura_events()$$
);

-- A cadeia até à notificação — as duas peças que falham já dentro do run.
INSERT INTO public.notificacao_tipo_map (event_type, tipo_legado)
VALUES ('custo.sem_viatura', 'custo_sem_viatura')
ON CONFLICT (event_type) DO NOTHING;

ALTER TABLE public.notificacoes DROP CONSTRAINT IF EXISTS notificacoes_tipo_check;
ALTER TABLE public.notificacoes ADD CONSTRAINT notificacoes_tipo_check CHECK (
  tipo = ANY (ARRAY[
    'motorista_pendente', 'escalonamento', 'viatura_disponivel', 'pedido_troca_kms',
    'recibo_anulado', 'viatura_seguro_expirando', 'viatura_inspecao_expirando',
    'motorista_carta_expirando', 'motorista_licenca_tvde_expirando', 'cobranca_gerada',
    'utilizador_criado', 'contrato_renting_renovacao_proxima', 'sistema_limite_email_atingido',
    'sistema_job_falhou', 'contrato_renting_criado', 'motorista_candidatura_parada',
    'contrato_renting_sem_checkin', 'viatura_extintor_expirando', 'viatura_iuc_a_pagar',
    'viatura_manutencao_preventiva_expirando', 'motorista_reparacao_cobranca',
    'assistencia_ticket_aberto_demasiado_tempo', 'motorista_ficha_incompleta',
    'invoice_nao_enviada_ao_cliente', 'seguranca_login_suspeito',
    'cobranca_em_atraso', 'motorista_recibo_por_validar',
    -- Novo:
    'custo_sem_viatura'
  ]::text[])
);
