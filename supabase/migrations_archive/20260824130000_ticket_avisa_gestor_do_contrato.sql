-- ============================================================
-- Ticket de assistência avisa o gestor do contrato TVDE activo
-- ============================================================
-- Hoje, abrir um ticket para uma viatura não avisa ninguém — fica à espera
-- que alguém repare na lista. Passa a chegar email e notificação ao gestor
-- do contrato activo daquela viatura.
--
-- ÂMBITO: só TVDE, como pedido. Rent-a-car não avisa. Das 226 viaturas com
-- contrato activo, 174 são TVDE.
--
-- PORQUE NÃO USA O MOTOR DE AUTOMAÇÃO (ao contrário do aviso de danos)
-- O motor resolve destinatários por três estratégias: `cargo`, `motorista` e
-- `gestor_responsavel`. Nenhuma serve aqui:
--   · `cargo` mandaria a TODOS os 13 gestores TVDE, e o pedido é o gestor
--     DAQUELE contrato;
--   · `gestor_responsavel` lê o nome de uma coluna da entidade, e `viaturas`
--     não tem essa coluna;
--   · `motorista` é outro destinatário.
-- Acrescentar uma estratégia obrigava a reescrever execute_automation_runs
-- (11 KB) por inteiro, às cegas, com o risco de partir os avisos que já
-- funcionam. Preferi gravar directamente em `notifications` +
-- `notification_queue`, exactamente com a forma que o motor usa — a fila de
-- email e o sino não notam a diferença.
--
-- O que se perde por não passar pelo motor: não aparece em Automações para
-- ligar/desligar, e não tem cooldown. O cooldown não faz falta — um ticket
-- nasce uma vez.
--
-- SÓ PARA A FRENTE: é AFTER INSERT. Tickets antigos não disparam.
-- ============================================================

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

drop trigger if exists trg_ticket_avisa_gestor_contrato on public.assistencia_tickets;
create trigger trg_ticket_avisa_gestor_contrato
  after insert on public.assistencia_tickets
  for each row
  execute function public.fn_ticket_avisa_gestor_contrato();

-- Template do email, por organização. Mesmo formato dos restantes.
insert into public.notification_templates
  (org_id, codigo, canal, idioma, assunto, corpo_template, corpo_formato, variaveis_esperadas)
select o.id,
       'assistencia.ticket_aberto_gestor',
       'email',
       'pt-PT',
       'Ticket aberto na viatura {{matricula}} (contrato {{contrato}})',
       'Foi aberto um ticket de assistência numa viatura de um contrato teu.' || chr(10) || chr(10) ||
       'Viatura: {{matricula}}' || chr(10) ||
       'Contrato: {{contrato}}' || chr(10) ||
       'Assunto: {{titulo}}' || chr(10) ||
       'Categoria: {{categoria}}' || chr(10) ||
       'Prioridade: {{prioridade}}' || chr(10) || chr(10) ||
       'Descrição: {{descricao}}' || chr(10) || chr(10) ||
       'Abrir o ticket: {{link}}',
       'text',
       array['matricula', 'contrato', 'titulo', 'categoria', 'prioridade', 'descricao', 'link']
  from public.organizacoes o
on conflict (codigo, canal, idioma, versao, org_id) do nothing;
