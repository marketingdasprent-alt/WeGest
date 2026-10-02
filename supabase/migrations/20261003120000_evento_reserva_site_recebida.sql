-- Avisa o Administrador quando chega uma reserva do site (API rent-a-car, fase C).
--
-- O evento reserva.site_recebida é publicado pela api_criar_reserva
-- (20261003110000). Aqui: tipo, mapa, template e uma regra de sino por
-- organização, pelo padrão de 20260923100000.
--
-- DECISÕES (utilizador, 02-10)
--   · Só o sino. O email ao cliente fica para a fase seguinte; um email à
--     equipa acrescenta-se na aba de automações se for preciso.
--   · Destinatários: cargo "Administrador". Outros cargos na aba de automações.
--   · Sem link de entidade e sem redefinir automation_catalogo(): o executor
--     não tem ramo 'reservas'; a mensagem diz o número da reserva.

insert into public.notificacao_tipos (tipo, descricao)
values ('reserva_site_recebida', 'Chegou uma reserva do site: atribuir viatura e confirmar.')
on conflict (tipo) do nothing;

insert into public.notificacao_tipo_map (event_type, tipo_legado)
values ('reserva.site_recebida', 'reserva_site_recebida')
on conflict (event_type) do nothing;

create or replace function public.seed_alerta_reserva_site_recebida(p_org_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_cargo_admin uuid;
begin
  insert into public.notification_templates
    (org_id, codigo, canal, idioma, assunto, corpo_template, corpo_formato, versao, ativo)
  values (
    p_org_id, 'reserva.site_recebida', 'email', 'pt-PT',
    'Reserva #{{codigo}} do site — {{modelo}}',
    'Chegou a reserva <b>#{{codigo}}</b> do site: <b>{{modelo}}</b> para <b>{{cliente}}</b>, ' ||
    'de {{data_inicio}} a {{data_fim}}. Total {{total}} €.<br><br>Atribuir viatura e confirmar.',
    'html', 1, true
  )
  on conflict do nothing;

  select c.id into v_cargo_admin
    from public.cargos c
   where c.org_id = p_org_id and c.nome = 'Administrador'
   order by c.created_at
   limit 1;

  if v_cargo_admin is null then
    raise warning
      'seed_alerta_reserva_site_recebida: organização % não tem cargo "Administrador" — regra não criada.',
      p_org_id;
    return;
  end if;

  insert into public.automation_rules
    (org_id, codigo, nome, descricao, event_type, condicoes, acao_tipo, acao_config,
     prioridade, cooldown_minutos, ativo, grupo_id)
  values
    (p_org_id, 'reserva.site_recebida', 'Reserva do site recebida',
     'Avisa quando o site cria uma reserva: falta atribuir viatura e confirmar.',
     'reserva.site_recebida', '[]'::jsonb, 'notificacao',
     jsonb_build_object(
       'titulo', 'Reserva do site',
       'template_codigo', 'reserva.site_recebida',
       'destinatarios_estrategia', 'cargo',
       'destinatarios_modo', 'grupo',
       'destinatarios_cargo_ids', jsonb_build_array(v_cargo_admin)),
     'media', 0, true, gen_random_uuid())
  on conflict (codigo, org_id) do nothing;
end;
$function$;

revoke all on function public.seed_alerta_reserva_site_recebida(uuid) from public, anon, authenticated;
grant execute on function public.seed_alerta_reserva_site_recebida(uuid) to service_role;

do $seed$
declare v_org record;
begin
  for v_org in select id from public.organizacoes loop
    perform public.seed_alerta_reserva_site_recebida(v_org.id);
  end loop;
end;
$seed$;

create or replace function public.tg_seed_alerta_reserva_site_recebida()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform public.seed_alerta_reserva_site_recebida(new.id);
  return null;
end;
$function$;

revoke all on function public.tg_seed_alerta_reserva_site_recebida() from public, anon, authenticated;

-- 'trigger_seed_...' ordena depois de 'trigger_auto_create_admin_cargo'. Não renomear.
drop trigger if exists trigger_seed_alerta_reserva_site_recebida on public.organizacoes;
create trigger trigger_seed_alerta_reserva_site_recebida
  after insert on public.organizacoes
  for each row execute function public.tg_seed_alerta_reserva_site_recebida();

notify pgrst, 'reload schema';
