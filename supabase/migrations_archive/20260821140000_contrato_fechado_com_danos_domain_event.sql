-- ============================================================
-- Aviso ao Gestor de Assistência: contrato fechado com danos
-- ============================================================
-- Quando um contrato é fechado e a recolha leva fotos, o gestor de
-- assistência tem de saber logo — hoje só descobre se alguém lhe disser, e
-- entretanto a viatura já foi para outro contrato.
--
-- PORQUE O TRIGGER É EM viatura_danos E NÃO EM contratos_renting
-- O fecho grava o estado PRIMEIRO e as fotos DEPOIS (ver useFecharContrato).
-- Um trigger no contrato dispararia antes de os danos existirem e o aviso
-- saía vazio. Aqui dispara quando o registo de danos nasce, já com o
-- contrato fechado.
--
-- SÓ PARA A FRENTE
-- É um trigger de INSERT: linhas antigas não disparam. E o event_type é novo,
-- por isso não há eventos por processar à espera no motor. Nada retroactivo.
--
-- ÂMBITO
-- Só quando o registo de danos vem de um contrato JÁ FECHADO. Danos
-- registados à mão na ficha da viatura também podem trazer contrato_renting_id
-- e não são fechos — por isso o estado do contrato faz parte da condição.
--
-- NOTA sobre as fotos: no instante deste trigger elas ainda não existem (são
-- gravadas a seguir ao registo de danos), por isso o aviso leva a descrição e
-- as observações, não a contagem de fotos. Preferi não mentir com um zero.
-- ============================================================

create or replace function public.fn_contrato_fechado_com_danos_domain_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contrato   record;
  v_cliente    text;
  v_matricula  text;
begin
  if new.contrato_renting_id is null then
    return new;
  end if;

  select c.id, c.org_id, c.codigo, c.matricula, c.cliente_id,
         c.data_inicio, c.data_fim, c.km_entrada, c.estado_operacional
    into v_contrato
    from public.contratos_renting c
   where c.id = new.contrato_renting_id
     and c.deleted_at is null;

  if not found then
    return new;
  end if;

  -- Danos registados à mão num contrato a decorrer não são um fecho.
  if v_contrato.estado_operacional not in ('fechado', 'devolvido') then
    return new;
  end if;

  select nome into v_cliente from public.clientes where id = v_contrato.cliente_id;

  select v.matricula into v_matricula from public.viaturas v where v.id = new.viatura_id;

  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  values (
    v_contrato.org_id,
    'contrato_renting.fechado_com_danos',
    'contratos_renting',
    v_contrato.id,
    jsonb_build_object(
      'codigo',        v_contrato.codigo,
      'matricula',     coalesce(v_matricula, v_contrato.matricula),
      'cliente_nome',  coalesce(v_cliente, '—'),
      'data_inicio',   v_contrato.data_inicio,
      'data_fim',      v_contrato.data_fim,
      'km_entrada',    v_contrato.km_entrada,
      'dano_descricao', coalesce(nullif(btrim(new.descricao), ''), 'Registo de recolha'),
      'dano_observacoes', coalesce(nullif(btrim(new.observacoes), ''), '—'),
      -- Domínio isolado numa linha de propósito: se a app mudar de endereço,
      -- é aqui e mais lado nenhum.
      'link', 'https://wegest.pt/renting/contratos/' || v_contrato.id::text
    ),
    'trigger'
  );

  return new;
end;
$$;

drop trigger if exists trg_contrato_fechado_com_danos_domain_event on public.viatura_danos;
create trigger trg_contrato_fechado_com_danos_domain_event
  after insert on public.viatura_danos
  for each row
  execute function public.fn_contrato_fechado_com_danos_domain_event();

-- ------------------------------------------------------------
-- Regra + template, por organização
-- ------------------------------------------------------------
-- Função própria em vez de mexer no seed_automacao_defaults: esse tem 234
-- linhas e é recriado por inteiro em cada migração que lhe toca. Reproduzi-lo
-- às cegas arriscava apagar regras que existam em produção e não estejam no
-- ficheiro mais recente do repositório. Isto é aditivo e não pode partir nada.
--
-- COOLDOWN DE 10 MINUTOS, e é preciso: a recolha pelo calendário cria UM
-- registo por dano, e sem isto um carro com três amolgadelas mandava três
-- emails do mesmo fecho.
create or replace function public.seed_automacao_danos_assistencia(p_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cargo_assistencia jsonb;
begin
  -- Mesmo critério que o send-assistance-notification já usa para decidir
  -- quem é gestor de assistência.
  select coalesce(jsonb_agg(c.id), '[]'::jsonb)
    into v_cargo_assistencia
    from public.cargos c
   where c.org_id = p_org_id
     and (c.nome ilike '%gestor de assistência%' or c.nome ilike '%gestor de assistencia%');

  insert into public.automation_rules
    (org_id, codigo, nome, event_type, acao_tipo, acao_config, cooldown_minutos)
  values (
    p_org_id,
    'contrato_renting.fechado_com_danos',
    'Contrato fechado com danos',
    'contrato_renting.fechado_com_danos',
    'notificacao',
    jsonb_build_object(
      'template_codigo', 'contrato_renting.fechado_com_danos',
      'destinatarios_estrategia', 'cargo',
      'destinatarios_cargo_ids', v_cargo_assistencia,
      'enviar_email', true,
      'titulo', 'Contrato fechado com danos'
    ),
    10
  )
  on conflict (codigo, org_id) do nothing;

  insert into public.notification_templates
    (org_id, codigo, canal, idioma, assunto, corpo_template, corpo_formato, variaveis_esperadas)
  values (
    p_org_id,
    'contrato_renting.fechado_com_danos',
    'email',
    'pt-PT',
    'Contrato {{codigo}} ({{matricula}}) fechado com danos',
    'O contrato {{codigo}} foi fechado e a recolha trouxe registo de danos.' || chr(10) || chr(10) ||
    'Viatura: {{matricula}}' || chr(10) ||
    'Cliente: {{cliente_nome}}' || chr(10) ||
    'Período: {{data_inicio}} a {{data_fim}}' || chr(10) ||
    'KM de entrada: {{km_entrada}}' || chr(10) || chr(10) ||
    'Danos: {{dano_descricao}}' || chr(10) ||
    'Observações: {{dano_observacoes}}' || chr(10) || chr(10) ||
    'Abrir o contrato: {{link}}',
    'text',
    array['codigo', 'matricula', 'cliente_nome', 'data_inicio', 'data_fim',
          'km_entrada', 'dano_descricao', 'dano_observacoes', 'link']
  )
  on conflict (codigo, canal, idioma, versao, org_id) do nothing;
end;
$$;

-- Organizações novas: o trigger de criação passa a semear isto também.
create or replace function public.trg_organizacoes_seed_automacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_base_cargos(new.id);
  perform public.seed_automacao_defaults(new.id);
  perform public.seed_automacao_danos_assistencia(new.id);
  return new;
end;
$$;

-- Organizações que já existem.
do $$
declare
  v_org record;
begin
  for v_org in select id from public.organizacoes loop
    perform public.seed_automacao_danos_assistencia(v_org.id);
  end loop;
end
$$;
