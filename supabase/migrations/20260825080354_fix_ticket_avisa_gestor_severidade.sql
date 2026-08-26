-- ============================================================
-- Correcção: severidade da notificação de ticket ao gestor
-- ============================================================
-- A versão anterior de fn_ticket_avisa_gestor_contrato escrevia 'info' na
-- severidade da notificação. A restrição notifications_severidade_check só
-- aceita baixa/normal/alta/urgente, por isso o INSERT falhava — e, por ser
-- dentro de um trigger AFTER INSERT, a falha desfazia também o ticket:
-- deixou de ser possível abrir assistências às viaturas com contrato TVDE
-- activo (as outras saem antes do INSERT e nunca foram afectadas).
--
-- Passa a mapear a prioridade do ticket (baixa/media/urgente) para os
-- valores que a restrição aceita. Já aplicada em produção a 25/08/2026;
-- este ficheiro fica para o histórico ficar reproduzível.
create or replace function public.fn_ticket_avisa_gestor_contrato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contrato   record;
  v_gestor     record;
  v_matricula  text;
  v_categoria  text;
  v_notif_id   uuid;
begin
  -- Contrato TVDE activo daquela viatura. Só a versão viva conta.
  select ct.id, ct.codigo, ct.gestor_id, ct.regime
    into v_contrato
    from public.contratos_renting ct
   where ct.viatura_id = new.viatura_id
     and ct.deleted_at is null
     and ct.substituido_em is null
     and ct.regime = 'tvde'
     and ct.estado_operacional in ('agendado', 'em_curso')
   order by ct.data_inicio desc
   limit 1;

  -- Sem contrato TVDE activo não há gestor a avisar, e isso é legítimo:
  -- rent-a-car, viatura parada, ou entre contratos.
  if not found or v_contrato.gestor_id is null then
    return new;
  end if;

  select p.id, p.nome, p.email
    into v_gestor
    from public.profiles p
   where p.id = v_contrato.gestor_id;

  if not found then
    return new;
  end if;

  select v.matricula into v_matricula
    from public.viaturas v where v.id = new.viatura_id;

  select c.nome into v_categoria
    from public.assistencia_categorias c where c.id = new.categoria_id;

  insert into public.notifications
    (org_id, destinatario_user_id, template_codigo, severidade, titulo,
     mensagem, link, entity_table, entity_id, payload)
  values (
    new.org_id,
    v_gestor.id,
    'assistencia.ticket_aberto_gestor',
    -- A restrição notifications_severidade_check só aceita
    -- baixa/normal/alta/urgente. A prioridade do ticket é baixa/media/urgente
    -- — 'media' não existe do outro lado, por isso mapeia-se. Sem isto o
    -- INSERT viola a restrição e, por falhar dentro do trigger, arrasta o
    -- ticket com ele: bloqueia as assistências às viaturas com contrato TVDE.
    case new.prioridade
      when 'urgente' then 'urgente'
      when 'baixa'   then 'baixa'
      else 'normal'
    end,
    'Ticket aberto na viatura ' || coalesce(v_matricula, '?'),
    coalesce(nullif(btrim(new.titulo), ''), 'Ticket de assistência'),
    '/assistencia/' || new.id::text,
    'assistencia_tickets',
    new.id,
    jsonb_build_object(
      'titulo',        coalesce(nullif(btrim(new.titulo), ''), 'Ticket de assistência'),
      'descricao',     coalesce(nullif(btrim(new.descricao), ''), '-'),
      'categoria',     coalesce(v_categoria, '-'),
      'prioridade',    coalesce(new.prioridade, '-'),
      'matricula',     coalesce(v_matricula, '?'),
      'contrato',      v_contrato.codigo,
      'gestor_nome',   coalesce(v_gestor.nome, '-'),
      'link',          'https://wegest.pt/assistencia/' || new.id::text
    )
  )
  returning id into v_notif_id;

  -- Sem email no perfil fica só o sino — melhor do que perder o aviso todo.
  if v_gestor.email is not null and btrim(v_gestor.email) <> '' then
    insert into public.notification_queue
      (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
    select v_notif_id, new.org_id, 'email', v_gestor.email,
           'assistencia.ticket_aberto_gestor', n.payload
      from public.notifications n where n.id = v_notif_id;
  end if;

  return new;
end;
$$;

