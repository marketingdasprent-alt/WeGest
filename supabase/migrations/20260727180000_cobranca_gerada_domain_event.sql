-- Motor de Automação — fecha o scope cut do Sub-projeto 2: publica
-- cobranca.gerada em domain_events sempre que uma nova linha nasce em
-- contrato_cobrancas (pelos crons semanais/mensais já existentes, ou
-- manualmente). Mesmo idioma de fn_recibo_anulado_avisos()
-- (supabase/migrations/20260707140000_recibo_anulado_avisos.sql):
-- SECURITY DEFINER, org_id direto de NEW (já preenchido pelo BEFORE
-- INSERT trg_contrato_cobrancas_set_org_id que corre antes deste).
-- Ver docs/superpowers/plans/2026-07-27-motor-automacao-cobranca-evento.md.

create or replace function public.fn_contrato_cobrancas_domain_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  values (
    new.org_id,
    'cobranca.gerada',
    'contrato_cobrancas',
    new.id,
    jsonb_build_object(
      'valor_total', new.valor_total,
      'destinatario_id', new.destinatario_id,
      'destinatario_nome', new.destinatario_nome,
      'tipo_cobranca', new.tipo_cobranca,
      'estado', new.estado
    ),
    'trigger'
  );
  return new;
end;
$$;

drop trigger if exists trg_contrato_cobrancas_domain_event on public.contrato_cobrancas;
create trigger trg_contrato_cobrancas_domain_event
  after insert on public.contrato_cobrancas
  for each row
  execute function public.fn_contrato_cobrancas_domain_event();
