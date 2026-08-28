-- ============================================================
-- Fase B: não criar em `notifications` o que nunca vai gerar email
-- ============================================================
-- MEDIDO EM 2026-08-26, depois da retenção da Fase A (71.200 linhas):
--   71.012 (99,7%) vêm de regras com `enviar_email = false`  -> ninguém as lê
--       33          de regras em modo digest                 -> geram email
--       32          de regras com email directo              -> geram email
--      123          alertas directos, sem regra              -> geram email
--
-- `notifications` é, de facto, o registo-pai do pipeline de email: a fila
-- depende dela por FK, o enrichContext lê-a para montar cada email, e o digest
-- lê/escreve digest_enviado_em. Nenhum frontend a lê — o que o utilizador vê
-- é `notificacoes`, escrita em paralelo pelo mesmo motor.
--
-- Logo, uma linha de uma regra sem email é criada para nada: 4.700/dia de
-- INSERT, WAL e índices que nada consome.
--
-- PORQUE UM TRIGGER E NÃO ALTERAR execute_automation_runs()
-- Essa função tem 276 linhas, foi reescrita 12 vezes em 4 dias, e cada
-- reescrita copia o corpo inteiro — já perdeu 'recibo_anulado',
-- 'cobranca_tvde_zero', o link em notifications e o cap diário de emails.
-- É o mesmo raciocínio de 20260729200000 para `notificacoes`: um trigger na
-- própria tabela cobre todos os escritores, actuais e futuros, e desfaz-se
-- largando o trigger.
--
-- O RISCO QUE ESSA MIGRAÇÃO AVISOU, E QUE AQUI FOI VERIFICADO
-- "nenhum dos escritores usa INSERT ... RETURNING (que receberia NULL)".
-- Aqui USA: execute_automation_runs faz `returning id into v_notification_id`
-- nas linhas 144 e 242, e usa essa variável no insert da fila (linhas 164 e
-- 261), onde notification_id é NOT NULL.
-- Verificado no corpo em produção antes de aplicar: AMBOS os inserts na fila
-- estão dentro de `if v_enviar_email ...`. Como este trigger só cancela quando
-- enviar_email = false, v_notification_id só fica NULL quando o insert na fila
-- não chega a acontecer. Não há caminho onde NULL alcance a fila.
--
-- EFEITO SECUNDÁRIO CONHECIDO: `automation_runs` conta notificações criadas no
-- detalhe de conclusão, e passa a contar linhas que foram canceladas. É
-- telemetria, não alimenta lógica nenhuma. Fica registado aqui em vez de
-- corrigido, porque corrigi-lo obrigaria a reescrever a função que este
-- trigger existe precisamente para não tocar.
--
-- ISTO ASSENTA A DIRECÇÃO DO CUTOVER
-- Depois disto, `notifications` é definitivamente o registo do pipeline de
-- email, e `notificacoes` o centro de notificações do utilizador — o inverso
-- do que 20260729110000 tinha decidido. Reverter é largar o trigger: uma
-- linha, sem perda de dados a partir desse momento.
--
-- VERIFICADO EM TESTE TRANSACCIONAL ANTES DE FICAR ACTIVO
--   regra sem email      -> cancelado (0 linhas)
--   regra com email      -> mantido (1)
--   regra em digest      -> mantido (1)   <- a fila só nasce depois
--   alerta directo       -> mantido (1)
--   RETURNING ao cancelar-> devolve NULL, como previsto e provado inofensivo
-- NÃO exercitado ainda pelo motor real: os emissores correm às 08:00.

create or replace function public.fn_notifications_so_quando_ha_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email boolean;
begin
  -- Alertas técnicos directos (job falhou, limite de email atingido, ticket ->
  -- gestor do contrato) não passam pelo motor de regras e criam sempre linha
  -- na fila. Nunca cancelar.
  if new.rule_run_id is null then
    return new;
  end if;

  select coalesce((ar.acao_config->>'enviar_email')::boolean, false)
    into v_email
  from public.automation_runs r
  join public.automation_rules ar on ar.id = r.rule_id
  where r.id = new.rule_run_id;

  -- Run ou regra que já não existe: preservar. Na dúvida, guardar — o custo
  -- de uma linha a mais é nulo ao pé do de perder o pai de um email.
  if v_email is null then
    return new;
  end if;

  -- `enviar_email = true` cobre também o modo digest: o digest exige
  -- enviar_email true, e a sua linha na fila só nasce mais tarde, em
  -- enviar_digests_diarios(). Cancelar por "não tem fila agora" partiria-o.
  if v_email then
    return new;
  end if;

  return null;
end;
$$;

comment on function public.fn_notifications_so_quando_ha_email() is
  'Cancela o INSERT em notifications quando a regra de origem não envia email — essas linhas não têm consumidor nenhum (nenhum frontend lê notifications). Preserva sempre: alertas directos (rule_run_id nulo), modo digest, e runs/regras já inexistentes.';

revoke execute on function public.fn_notifications_so_quando_ha_email() from anon, authenticated;

drop trigger if exists trg_notifications_so_quando_ha_email on public.notifications;
create trigger trg_notifications_so_quando_ha_email
  before insert on public.notifications
  for each row execute function public.fn_notifications_so_quando_ha_email();
