-- ============================================================================
-- Dois gatilhos novos no Financeiro: cobrança em atraso e recibo por validar
-- ============================================================================
--
-- COBRANÇA EM ATRASO
--
-- Já existe `emit_lembretes_cobranca_atrasada`, mas serve outro fim: manda um
-- email AO CLIENTE, uma única vez (marca `lembrete_atraso_enviado_em` e nunca
-- mais toca no assunto), fora do motor de automações — sem regra, sem
-- interruptor, sem registo, sem cooldown. E exige email de cliente: uma
-- cobrança de cliente sem email nunca é avisada, nem uma vez.
--
-- Medido a 2026-09-07: 82 cobranças em atraso, 81 744,97 €, até 59 dias.
-- Dessas, 80 já tinham levado o lembrete ao cliente — ou seja, o sistema deu o
-- assunto por tratado — e 2 nunca o levariam por falta de email. Ninguém
-- dentro da empresa era avisado de nada.
--
-- Este evento é o lado INTERNO: não envia nada para fora, não mexe no
-- lembrete ao cliente e não escreve em `lembrete_atraso_enviado_em`. Serve
-- para o motor poder notificar quem trata das cobranças, com uma regra que se
-- liga, desliga e tem cooldown como todas as outras.
--
-- O saldo é o mesmo cálculo do resto da aplicação (ver useContasAReceber.ts):
-- valor_total − recibos activos − notas de crédito activas. O `estado` sozinho
-- não chega: uma cobrança fica `emitida` mesmo depois de parcialmente paga ou
-- creditada.
--
-- RECIBO POR VALIDAR
--
-- `motorista_recibos` com estado `submetido`: o motorista entregou, ninguém
-- validou. Medido a 2026-09-07: 26 submetidos, 23 há mais de 7 dias. Os 7 dias
-- de carência existem para o evento não disparar sobre o que acabou de chegar
-- e ainda está dentro do normal.
--
-- DEDUPLICAÇÃO
--
-- A guarda `processed_at is null` é a mesma de `emit_faturas_nao_enviadas_events`:
-- não volta a emitir enquanto o evento anterior estiver por processar. O ritmo
-- com que a mesma cobrança volta a avisar é depois decidido pelo
-- `cooldown_minutos` da regra, não aqui.
-- ============================================================================

CREATE OR REPLACE FUNCTION "public"."emit_cobrancas_em_atraso_events"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  with recibos_por_cobranca as (
    select referencia, sum(valor) as pago
    from public.recibos
    where estado = 'ativo'
    group by referencia
  ),
  creditado_por_cobranca as (
    select cobranca_id, sum(valor) as creditado
    from public.notas_credito
    where estado = 'ativo'
    group by cobranca_id
  ),
  elegiveis as (
    select
      c.id,
      c.org_id,
      c.destinatario_nome,
      c.contrato_id,
      c.emitida_em,
      round((c.valor_total - coalesce(r.pago, 0) - coalesce(nc.creditado, 0))::numeric, 2) as saldo,
      floor(extract(epoch from (now() - c.emitida_em)) / 86400)::int as dias_em_aberto
    from public.contrato_cobrancas c
    left join recibos_por_cobranca r on r.referencia = c.id::text
    left join creditado_por_cobranca nc on nc.cobranca_id = c.id
    where c.estado = 'emitida'
      and c.emitida_em is not null
      and c.org_id is not null
  )
  select
    e.org_id,
    'cobranca.em_atraso',
    'contrato_cobrancas',
    e.id,
    jsonb_build_object(
      'destinatario_nome', e.destinatario_nome,
      'saldo', e.saldo,
      'dias_em_aberto', e.dias_em_aberto,
      'emitida_em', e.emitida_em,
      'contrato_id', e.contrato_id
    ),
    'cron'
  from elegiveis e
  where e.saldo > 0.005
    and e.dias_em_aberto > 30
    and not exists (
      select 1 from public.domain_events d
      where d.entity_table = 'contrato_cobrancas'
        and d.entity_id = e.id
        and d.event_type = 'cobranca.em_atraso'
        and d.processed_at is null
    );
end;
$$;

COMMENT ON FUNCTION "public"."emit_cobrancas_em_atraso_events"() IS
  'Emite cobranca.em_atraso para cobrancas emitidas ha mais de 30 dias com saldo por liquidar. Lado interno: nao envia nada ao cliente nem toca em lembrete_atraso_enviado_em (isso e do emit_lembretes_cobranca_atrasada).';

CREATE OR REPLACE FUNCTION "public"."emit_recibos_por_validar_events"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    r.org_id,
    'motorista_recibo.por_validar',
    'motorista_recibos',
    r.id,
    jsonb_build_object(
      'motorista_id', r.motorista_id,
      'dias_a_espera', floor(extract(epoch from (now() - r.created_at)) / 86400)::int
    ),
    'cron'
  from public.motorista_recibos r
  where r.status = 'submetido'
    and r.org_id is not null
    and r.created_at <= now() - interval '7 days'
    and not exists (
      select 1 from public.domain_events d
      where d.entity_table = 'motorista_recibos'
        and d.entity_id = r.id
        and d.event_type = 'motorista_recibo.por_validar'
        and d.processed_at is null
    );
end;
$$;

COMMENT ON FUNCTION "public"."emit_recibos_por_validar_events"() IS
  'Emite motorista_recibo.por_validar para recibos verdes submetidos ha mais de 7 dias e ainda por validar.';

-- Os emissores correm sem sessão (cron), por isso nunca devem estar ao alcance
-- de quem não tem sessão nenhuma — mesma regra do rls_anon_exposure.test.sql.
REVOKE ALL ON FUNCTION "public"."emit_cobrancas_em_atraso_events"() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION "public"."emit_recibos_por_validar_events"() FROM PUBLIC, anon;

-- Às 8h, com os restantes emissores diários.
SELECT cron.schedule(
  'automation-emit-cobrancas-em-atraso-diario',
  '0 8 * * *',
  $$select public.emit_cobrancas_em_atraso_events()$$
);

SELECT cron.schedule(
  'automation-emit-recibos-por-validar-diario',
  '0 8 * * *',
  $$select public.emit_recibos_por_validar_events()$$
);

-- ============================================================================
-- A cadeia completa até à notificação
-- ============================================================================
--
-- Emitir o evento não chega. Para o motor conseguir criar a notificação faltam
-- duas peças, e ambas falham TARDE — já dentro do run, com a regra ligada e o
-- utilizador à espera:
--
--   1. `notificacao_tipo_map` traduz o event_type no `tipo` legado;
--   2. `notificacoes_tipo_check` é uma lista fechada de tipos aceites. Sem lá
--      estar, o insert rebenta e o run fica em erro.
-- ============================================================================

INSERT INTO public.notificacao_tipo_map (event_type, tipo_legado)
VALUES
  ('cobranca.em_atraso', 'cobranca_em_atraso'),
  ('motorista_recibo.por_validar', 'motorista_recibo_por_validar')
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
    -- Novos:
    'cobranca_em_atraso', 'motorista_recibo_por_validar'
  ]::text[])
);
