-- ============================================================
-- Retenção de `notifications` inertes — 98,4% da tabela não serve para nada
-- ============================================================
-- AUDITADO EM 2026-08-26 (produção)
--   156.303 linhas · 62 MB · ~4.700/dia · 0 lidas · 0 resolvidas
--   153.824 (98,4%) sem linha na fila, sem registo de entrega e sem digest
--
-- `limpar_notificacoes_antigas()` nunca apagou uma única linha desta tabela:
-- apaga `where resolvida = true`, e `resolvida` é sempre false porque nenhum
-- frontend lê `notifications` — quem resolve, resolve na tabela legada.
--
-- PORQUE NÃO SE PODE SIMPLESMENTE APAGAR A TABELA
-- `notifications` não é resíduo: é o registo-pai do pipeline de email.
--   · notification_queue.notification_id  -> FK ON DELETE CASCADE
--   · notification_delivery.notification_id -> FK ON DELETE SET NULL
--   · enrichContext.ts lê link/entity_table/entity_id/destinatario_user_id
--     para montar destinatarioNome, ctaUrl e viaturaMarcaModelo de CADA email
--   · enviar_digests_diarios() lê e escreve digest_enviado_em
-- O que sobra são as linhas criadas por destinatário que nunca geraram email.
--
-- O QUE ESTA FUNÇÃO APAGA — e só isto
--   mais velhas do que N dias  E  sem linha na fila  E  sem registo de entrega
--   E  nunca incluídas num digest
-- Uma linha com qualquer dependente é preservada seja qual for a idade.
--
-- A ASSERÇÃO NÃO É DECORATIVA
-- A FK da fila é ON DELETE CASCADE: uma condição mal escrita aqui apagaria
-- emails por enviar, em silêncio. A contagem antes/depois corre dentro da mesma
-- transacção — se divergir, o DELETE é revertido em vez de destruir a fila.
--
-- MEDIDO EM TESTE TRANSACCIONAL ANTES DE APLICAR (corte de 7 dias, o mais
-- agressivo): 121.058 linhas apagadas, fila 2405 -> 2405, delivery 2405 -> 2405.
--
-- PRIMEIRA EXECUÇÃO REAL (14 dias, 2026-08-26): 156.303 -> 71.200 (85.103
-- apagadas). Fila 2405 intacta, delivery 2405 intacto, 1839 do digest
-- preservadas, 0 linhas de fila órfãs. Estado estacionário esperado ~66.000.
--
-- PORQUE 14 DIAS E NÃO 30
-- A tabela só existe desde 2026-07-27. Com corte de 30 dias apagaria 774 linhas
-- e estabilizaria em ~141.000 — não resolvia o crescimento que motivou isto.
-- 14 dias dá duas semanas para investigar um email falhado a posteriori, e o
-- que interessa mesmo (fila, entrega, digest) é preservado por dependência,
-- não por idade.

create or replace function public.limpar_notifications_inertes(p_dias integer default 14)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_corte       timestamptz := now() - make_interval(days => p_dias);
  v_antes       integer;
  v_apagadas    integer;
  v_fila_antes  integer;
  v_fila_depois integer;
begin
  select count(*) into v_antes      from public.notifications;
  select count(*) into v_fila_antes from public.notification_queue;

  delete from public.notifications n
  where n.created_at < v_corte
    and n.digest_enviado_em is null
    and not exists (select 1 from public.notification_queue    q where q.notification_id = n.id)
    and not exists (select 1 from public.notification_delivery d where d.notification_id = n.id);
  get diagnostics v_apagadas = row_count;

  select count(*) into v_fila_depois from public.notification_queue;

  if v_fila_antes <> v_fila_depois then
    raise exception
      'Abortado: a limpeza tocou na fila de emails (% -> %). O CASCADE apagaria envios pendentes.',
      v_fila_antes, v_fila_depois;
  end if;

  return jsonb_build_object(
    'apagadas',   v_apagadas,
    'antes',      v_antes,
    'restantes',  v_antes - v_apagadas,
    'corte',      v_corte,
    'dias',       p_dias,
    'fila_intacta', true
  );
end;
$$;

comment on function public.limpar_notifications_inertes(integer) is
  'Apaga linhas de notifications com mais de N dias que não têm linha na fila de email, nem registo de entrega, nem digest — ou seja, que não têm consumidor nenhum. Preserva tudo o que tem dependentes, seja qual for a idade. Aborta se a fila mudar de tamanho (a FK é ON DELETE CASCADE).';

-- Só o cron (service_role). Um utilizador autenticado não apaga em massa.
revoke all on function public.limpar_notifications_inertes(integer) from public, anon, authenticated;
grant execute on function public.limpar_notifications_inertes(integer) to service_role;

-- 04:10 — a seguir a limpar-notificacoes-antigas (04:00), e longe da emissão
-- de eventos (08:00), do digest (09:00) e do worker de acordos (06:00).
select cron.unschedule('limpar-notifications-inertes')
where exists (select 1 from cron.job where jobname = 'limpar-notifications-inertes');

select cron.schedule(
  'limpar-notifications-inertes',
  '10 4 * * *',
  $$select public.limpar_notifications_inertes(14)$$
);
