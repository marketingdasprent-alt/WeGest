-- Ligação dos templates de email aos crons (chefe pediu). O template HTML
-- "Contrato criado" (contratoTemplate tipo='criado') fala diretamente com o
-- cliente ("o seu contrato está pronto..."), mas a regra de automação hoje
-- só notifica o staff internamente (destinatarios_estrategia='cargo') — o
-- cliente nunca recebe nada. O cliente não tem conta auth.users, por isso
-- não cabe em notifications/notification_queue (destinatario_user_id é
-- NOT NULL) — segue-se o mesmo padrão já usado em cobranca_atrasada e
-- recibo_anulado: o próprio trigger de INSERT chama diretamente, via
-- net.http_post, uma edge function dedicada (send-contrato-criado-cliente).
--
-- A notificação interna ao staff (domain_events/automation_rules) fica
-- inalterada. O envio ao cliente só dispara se o toggle "Enviar por email"
-- já configurado para este evento (acao_config->>'enviar_email') estiver
-- ligado — mesmo botão que a organização já usa no ecrã Configurar, só que
-- agora também controla o email ao cliente, não só ao staff.

create or replace function public.fn_contratos_renting_criado_domain_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente_nome text;
  v_cliente_email text;
  v_enviar_email boolean;
begin
  if new.contrato_anterior_id is not null then
    return new;
  end if;

  select nome, email into v_cliente_nome, v_cliente_email from public.clientes where id = new.cliente_id;

  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  values (
    new.org_id,
    'contrato_renting.criado',
    'contratos_renting',
    new.id,
    jsonb_build_object(
      'codigo', new.codigo,
      'matricula', new.matricula,
      'cliente_nome', v_cliente_nome,
      'regime', new.regime,
      'data_inicio', new.data_inicio,
      'valor', coalesce(new.valor_total_manual, new.tarifa_diaria)
    ),
    'trigger'
  );

  select coalesce((acao_config->>'enviar_email')::boolean, false)
  into v_enviar_email
  from public.automation_rules
  where org_id = new.org_id and event_type = 'contrato_renting.criado'
  limit 1;

  if v_enviar_email and v_cliente_email is not null then
    perform net.http_post(
      url := 'https://hkqzzxgeedsmjnhyquke.supabase.co/functions/v1/send-contrato-criado-cliente',
      headers := jsonb_build_object(
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcXp6eGdlZWRzbWpuaHlxdWtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4ODQyMTAsImV4cCI6MjA2NDQ2MDIxMH0.E-x-p5RjQoZfyw6YVwQlWC-Ao27-IPWvyqRIM0PzA-U',
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'orgId', new.org_id,
        'contratoId', new.id,
        'destinatarioNome', v_cliente_nome,
        'destinatarioEmail', v_cliente_email,
        'matricula', new.matricula,
        'regime', new.regime,
        'dataInicio', new.data_inicio,
        'valor', coalesce(new.valor_total_manual, new.tarifa_diaria)
      )
    );
  end if;

  return new;
end;
$$;
