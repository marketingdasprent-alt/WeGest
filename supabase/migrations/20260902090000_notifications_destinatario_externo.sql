-- ============================================================================
-- notifications ganha um destinatário alternativo, fora da WeGest
-- ============================================================================
--
-- O envio em si (send-notification-queue-email) já lê o destinatário como uma
-- string solta — notification_queue.destinatario — e usa-a directamente como
-- endereço de envio. O único bloqueio estrutural para um destinatário externo
-- estava aqui: destinatario_user_id NOT NULL na linha-mãe.
--
-- Sem migração de dados: toda linha existente já tem destinatario_user_id
-- preenchido, logo continua a bater com o primeiro ramo da CHECK.
-- ============================================================================

alter table public.notifications
  alter column destinatario_user_id drop not null;

alter table public.notifications
  add column destinatario_email_externo text;

alter table public.notifications
  add constraint notifications_destinatario_check
  check (
    (destinatario_user_id is not null and destinatario_email_externo is null)
    or
    (destinatario_user_id is null and destinatario_email_externo is not null)
  );

-- A idempotência de retry já existe para o interno
-- (idx_notifications_idem_run_destinatario, sobre rule_run_id+destinatario_user_id)
-- mas NULL <> NULL num índice único: sem este gémeo, um retry duplicava a
-- notifications de um endereço externo em vez de reencontrar a mesma linha.
create unique index idx_notifications_idem_run_destinatario_externo
  on public.notifications (rule_run_id, destinatario_email_externo)
  where rule_run_id is not null and destinatario_email_externo is not null;
