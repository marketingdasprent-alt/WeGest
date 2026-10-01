-- Emails de aviso organizados em linhas e sem travessões.
--
-- Os avisos chegavam numa linha só ("titular: X → Y; estado: em_uso → disponivel;
-- data de devolução: — → 23/09/2026") e cheios de travessões. O layout do email
-- (formatarCorpo) já põe cada linha "Etiqueta: valor" numa tabela: falta os textos
-- virem em linhas. Aqui:
--   1. cartão e contrato alterados passam a dar "Antes" e "Agora", campo a campo;
--   2. o resumo diário lista cada aviso com os seus campos, um por linha;
--   3. os 28 modelos de email são reescritos em linhas, sem travessões, e
--      aplicados a todas as organizações (e às novas, depois das sementes).
-- Idempotente.

-- 1) Formatação das alterações ------------------------------------------------

create or replace function public.alteracao_valor(p_campo text, p_valor text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_valor is null or p_valor in ('—', '–', '') then 'sem dados'
    when p_campo = 'estado' then
      case p_valor
        when 'em_uso' then 'Em uso'
        when 'disponivel' then 'Disponível'
        else upper(left(replace(p_valor, '_', ' '), 1)) || substr(replace(p_valor, '_', ' '), 2)
      end
    else p_valor
  end
$$;

-- Uma linha "Campo: valor" por alteração, do lado pedido ('antes' ou 'depois').
create or replace function public.alteracoes_em_linhas(p_alteracoes jsonb, p_lado text)
returns text
language sql
immutable
set search_path = ''
as $$
  select string_agg(
           upper(left(x.a->>'campo', 1)) || substr(x.a->>'campo', 2) || ': '
             || public.alteracao_valor(x.a->>'campo', x.a->>p_lado),
           chr(10) order by x.o)
    from jsonb_array_elements(p_alteracoes) with ordinality as x(a, o)
$$;

-- Versão de uma linha, para o sino.
create or replace function public.alteracoes_numa_linha(p_alteracoes jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select string_agg(
           upper(left(x.a->>'campo', 1)) || substr(x.a->>'campo', 2) || ': '
             || public.alteracao_valor(x.a->>'campo', x.a->>'antes') || ' → '
             || public.alteracao_valor(x.a->>'campo', x.a->>'depois'),
           '; ' order by x.o)
    from jsonb_array_elements(p_alteracoes) with ordinality as x(a, o)
$$;

revoke all on function public.alteracao_valor(text, text) from public, anon;
revoke all on function public.alteracoes_em_linhas(jsonb, text) from public, anon;
revoke all on function public.alteracoes_numa_linha(jsonb) from public, anon;

-- 2) Cartão alterado ----------------------------------------------------------
-- Igual a 20260922130000, mudando só o texto: antes_texto/depois_texto para o
-- email, mensagem do sino sem travessão.

CREATE OR REPLACE FUNCTION public.fn_cartao_frota_alterado_domain_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alteracoes   jsonb := '[]'::jsonb;
  v_alteracao    text;
  v_titular_antes  text;
  v_titular_depois text;
  v_alterado_por text;
  v_texto        text;
BEGIN
  -- Titular primeiro: é a alteração que mexe em quem paga o combustível.
  IF (NEW.motorista_id IS DISTINCT FROM OLD.motorista_id)
     OR (NEW.cliente_id IS DISTINCT FROM OLD.cliente_id) THEN
    v_titular_antes  := public.cartao_frota_titular_nome(OLD.motorista_id, OLD.cliente_id);
    v_titular_depois := public.cartao_frota_titular_nome(NEW.motorista_id, NEW.cliente_id);
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'titular', 'antes', v_titular_antes, 'depois', v_titular_depois);
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'estado', 'antes', OLD.status, 'depois', NEW.status);
  END IF;

  IF NEW.ativo IS DISTINCT FROM OLD.ativo THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'ativo',
      'antes',  case when OLD.ativo then 'sim' else 'não' end,
      'depois', case when NEW.ativo then 'sim' else 'não' end);
  END IF;

  IF NEW.limite IS DISTINCT FROM OLD.limite THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'plafond',
      'antes',  coalesce(OLD.limite::text, 'sem dados'),
      'depois', coalesce(NEW.limite::text, 'sem dados'));
  END IF;

  IF NEW.numero IS DISTINCT FROM OLD.numero THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'número', 'antes', OLD.numero, 'depois', NEW.numero);
  END IF;

  IF NEW.tipo IS DISTINCT FROM OLD.tipo THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'tipo',
      'antes',  public.cartao_frota_tipo_label(OLD.tipo),
      'depois', public.cartao_frota_tipo_label(NEW.tipo));
  END IF;

  IF NEW.data_validade IS DISTINCT FROM OLD.data_validade THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'validade',
      'antes',  coalesce(to_char(OLD.data_validade, 'DD/MM/YYYY'), 'sem data'),
      'depois', coalesce(to_char(NEW.data_validade, 'DD/MM/YYYY'), 'sem data'));
  END IF;

  IF NEW.data_entrega IS DISTINCT FROM OLD.data_entrega THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'data de entrega',
      'antes',  coalesce(to_char(OLD.data_entrega, 'DD/MM/YYYY'), 'sem data'),
      'depois', coalesce(to_char(NEW.data_entrega, 'DD/MM/YYYY'), 'sem data'));
  END IF;

  IF NEW.data_devolucao IS DISTINCT FROM OLD.data_devolucao THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'data de devolução',
      'antes',  coalesce(to_char(OLD.data_devolucao, 'DD/MM/YYYY'), 'sem data'),
      'depois', coalesce(to_char(NEW.data_devolucao, 'DD/MM/YYYY'), 'sem data'));
  END IF;

  -- Só mudou o que não se vigia (notas, updated_at, ...): nada a avisar.
  IF jsonb_array_length(v_alteracoes) = 0 THEN
    RETURN NEW;
  END IF;

  -- Classificação grossa para as condições das regras: o que importa mais.
  v_alteracao := CASE
    WHEN v_alteracoes @> '[{"campo":"titular"}]' THEN 'titular'
    WHEN v_alteracoes @> '[{"campo":"estado"}]' OR v_alteracoes @> '[{"campo":"ativo"}]' THEN 'estado'
    WHEN v_alteracoes @> '[{"campo":"plafond"}]' THEN 'plafond'
    ELSE 'dados'
  END;

  v_texto := public.alteracoes_numa_linha(v_alteracoes);

  -- auth.uid() é nulo no cron e no service_role: a mensagem não o menciona e
  -- o email diz que foi um processo automático.
  SELECT p.nome INTO v_alterado_por
    FROM public.profiles p
   WHERE p.id = auth.uid();

  INSERT INTO public.domain_events
    (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  VALUES (
    NEW.org_id,
    'cartao_frota.alterado',
    'cartoes_frota',
    NEW.id,
    jsonb_build_object(
      'numero',          NEW.numero,
      'tipo',            NEW.tipo,
      'tipo_label',      public.cartao_frota_tipo_label(NEW.tipo),
      'status',          NEW.status,
      'ativo',           NEW.ativo,
      'alteracao',       v_alteracao,
      'titular_tipo',    CASE WHEN NEW.motorista_id IS NOT NULL THEN 'motorista'
                              WHEN NEW.cliente_id   IS NOT NULL THEN 'cliente'
                              ELSE 'nenhum' END,
      'titular',         public.cartao_frota_titular_nome(NEW.motorista_id, NEW.cliente_id),
      'titular_antes',   v_titular_antes,
      'titular_depois',  v_titular_depois,
      'alteracoes',      v_alteracoes,
      'alteracoes_texto', v_texto,
      'antes_texto',     public.alteracoes_em_linhas(v_alteracoes, 'antes'),
      'depois_texto',    public.alteracoes_em_linhas(v_alteracoes, 'depois'),
      'alterado_por',    coalesce(v_alterado_por, 'um processo automático'),
      'mensagem',        'Cartão ' || public.cartao_frota_tipo_label(NEW.tipo) || ' nº ' || NEW.numero
                         || ' alterado. ' || v_texto || '.'
                         || CASE WHEN v_alterado_por IS NOT NULL THEN ' Por ' || v_alterado_por || '.' ELSE '' END
    ),
    'trigger'
  );

  RETURN NEW;
END;
$function$;

-- 3) Contrato alterado ---------------------------------------------------------
-- Igual a 20260923100000, com o mesmo ajuste de texto; nomes em falta deixam de
-- aparecer como travessão.

CREATE OR REPLACE FUNCTION public.contrato_motorista_nome(p_motorista_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((select m.nome from public.motoristas_ativos m where m.id = p_motorista_id), 'sem motorista')
$function$;

CREATE OR REPLACE FUNCTION public.contrato_viatura_matricula(p_viatura_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((select v.matricula from public.viaturas v where v.id = p_viatura_id), 'sem viatura')
$function$;

CREATE OR REPLACE FUNCTION public.contrato_empresa_nome(p_empresa_id text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce((select e.nome from public.empresas e where e.id = p_empresa_id), p_empresa_id, 'sem empresa')
$function$;

CREATE OR REPLACE FUNCTION public.fn_contrato_alterado_domain_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alteracoes   jsonb := '[]'::jsonb;
  v_alteracao    text;
  v_alterado_por text;
  v_texto        text;
  v_rotulo       text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'estado', 'antes', coalesce(OLD.status, 'sem dados'), 'depois', coalesce(NEW.status, 'sem dados'));
  END IF;

  IF NEW.motorista_id IS DISTINCT FROM OLD.motorista_id THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'motorista',
      'antes',  public.contrato_motorista_nome(OLD.motorista_id),
      'depois', public.contrato_motorista_nome(NEW.motorista_id));
  END IF;

  IF NEW.viatura_id IS DISTINCT FROM OLD.viatura_id THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'viatura',
      'antes',  public.contrato_viatura_matricula(OLD.viatura_id),
      'depois', public.contrato_viatura_matricula(NEW.viatura_id));
  END IF;

  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'empresa',
      'antes',  public.contrato_empresa_nome(OLD.empresa_id),
      'depois', public.contrato_empresa_nome(NEW.empresa_id));
  END IF;

  IF NEW.data_inicio IS DISTINCT FROM OLD.data_inicio THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'início',
      'antes',  coalesce(to_char(OLD.data_inicio, 'DD/MM/YYYY'), 'sem data'),
      'depois', coalesce(to_char(NEW.data_inicio, 'DD/MM/YYYY'), 'sem data'));
  END IF;

  IF NEW.data_fim IS DISTINCT FROM OLD.data_fim THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'fim',
      'antes',  coalesce(to_char(OLD.data_fim, 'DD/MM/YYYY'), 'sem data'),
      'depois', coalesce(to_char(NEW.data_fim, 'DD/MM/YYYY'), 'sem data'));
  END IF;

  IF NEW.duracao_meses IS DISTINCT FROM OLD.duracao_meses THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'duração (meses)',
      'antes',  coalesce(OLD.duracao_meses::text, 'sem dados'),
      'depois', coalesce(NEW.duracao_meses::text, 'sem dados'));
  END IF;

  IF NEW.numero_contrato IS DISTINCT FROM OLD.numero_contrato THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'número',
      'antes',  coalesce(OLD.numero_contrato::text, 'sem dados'),
      'depois', coalesce(NEW.numero_contrato::text, 'sem dados'));
  END IF;

  IF NEW.km_checkout IS DISTINCT FROM OLD.km_checkout THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'km check-out',
      'antes',  coalesce(OLD.km_checkout::text, 'sem dados'),
      'depois', coalesce(NEW.km_checkout::text, 'sem dados'));
  END IF;

  IF NEW.km_checkin IS DISTINCT FROM OLD.km_checkin THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'km check-in',
      'antes',  coalesce(OLD.km_checkin::text, 'sem dados'),
      'depois', coalesce(NEW.km_checkin::text, 'sem dados'));
  END IF;

  IF NEW.checkout_pendente IS DISTINCT FROM OLD.checkout_pendente THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'check-out pendente',
      'antes',  case when OLD.checkout_pendente then 'sim' else 'não' end,
      'depois', case when NEW.checkout_pendente then 'sim' else 'não' end);
  END IF;

  IF NEW.checkin_pendente IS DISTINCT FROM OLD.checkin_pendente THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'check-in pendente',
      'antes',  case when OLD.checkin_pendente then 'sim' else 'não' end,
      'depois', case when NEW.checkin_pendente then 'sim' else 'não' end);
  END IF;

  IF NEW.documento_url IS DISTINCT FROM OLD.documento_url THEN
    v_alteracoes := v_alteracoes || jsonb_build_object(
      'campo', 'documento',
      'antes',  case when OLD.documento_url is null then 'sem ficheiro' else 'com ficheiro' end,
      'depois', case when NEW.documento_url is null then 'sem ficheiro' else 'com ficheiro' end);
  END IF;

  -- Só mudou o que não se vigia (versao, atualizado_em, combustível, ...).
  IF jsonb_array_length(v_alteracoes) = 0 THEN
    RETURN NEW;
  END IF;

  -- Classificação grossa para as condições das regras.
  v_alteracao := CASE
    WHEN v_alteracoes @> '[{"campo":"estado"}]' THEN 'estado'
    WHEN v_alteracoes @> '[{"campo":"motorista"}]' OR v_alteracoes @> '[{"campo":"viatura"}]' THEN 'partes'
    WHEN v_alteracoes @> '[{"campo":"início"}]' OR v_alteracoes @> '[{"campo":"fim"}]'
         OR v_alteracoes @> '[{"campo":"duração (meses)"}]' THEN 'datas'
    WHEN v_alteracoes @> '[{"campo":"km check-out"}]' OR v_alteracoes @> '[{"campo":"km check-in"}]'
         OR v_alteracoes @> '[{"campo":"check-out pendente"}]' OR v_alteracoes @> '[{"campo":"check-in pendente"}]' THEN 'checks'
    ELSE 'dados'
  END;

  v_texto := public.alteracoes_numa_linha(v_alteracoes);

  -- auth.uid() é nulo no cron e no service_role; a mensagem não o menciona.
  SELECT p.nome INTO v_alterado_por
    FROM public.profiles p
   WHERE p.id = auth.uid();

  v_rotulo := 'Contrato ' || coalesce('nº ' || NEW.numero_contrato::text, 'sem número')
              || ' de ' || coalesce(NEW.motorista_nome, public.contrato_motorista_nome(NEW.motorista_id));

  INSERT INTO public.domain_events
    (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  VALUES (
    NEW.org_id,
    'contrato.alterado',
    'contratos',
    NEW.id,
    jsonb_build_object(
      'numero_contrato',  NEW.numero_contrato,
      'status',           NEW.status,
      'alteracao',        v_alteracao,
      'motorista_id',     NEW.motorista_id,
      'motorista',        coalesce(NEW.motorista_nome, public.contrato_motorista_nome(NEW.motorista_id)),
      'viatura_id',       NEW.viatura_id,
      'viatura',          public.contrato_viatura_matricula(NEW.viatura_id),
      'empresa',          public.contrato_empresa_nome(NEW.empresa_id),
      'data_inicio',      NEW.data_inicio,
      'data_fim',         NEW.data_fim,
      'alteracoes',       v_alteracoes,
      'alteracoes_texto', v_texto,
      'antes_texto',      public.alteracoes_em_linhas(v_alteracoes, 'antes'),
      'depois_texto',     public.alteracoes_em_linhas(v_alteracoes, 'depois'),
      'alterado_por',     coalesce(v_alterado_por, 'um processo automático'),
      'mensagem',         v_rotulo || ' alterado. ' || v_texto || '.'
                          || CASE WHEN v_alterado_por IS NOT NULL THEN ' Por ' || v_alterado_por || '.' ELSE '' END
    ),
    'trigger'
  );

  RETURN NEW;
END;
$function$;

-- 4) Resumo diário -------------------------------------------------------------

-- Etiqueta legível para uma chave do payload ("matricula" → "Matrícula").
create or replace function public.rotulo_campo_aviso(p_chave text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_chave
    when 'matricula' then 'Matrícula'
    when 'cliente_nome' then 'Cliente'
    when 'codigo' then 'Contrato'
    when 'numero' then 'Número'
    when 'titulo' then 'Assunto'
    when 'descricao' then 'Descrição'
    when 'status' then 'Estado'
    when 'km_atual' then 'Km actual'
    when 'proxima_manutencao_km' then 'Próxima revisão (km)'
    when 'proxima_manutencao_data' then 'Próxima revisão'
    when 'licenca_tvde_validade' then 'Licença válida até'
    when 'carta_validade' then 'Carta válida até'
    when 'seguro_validade' then 'Seguro válido até'
    when 'inspecao_validade' then 'Inspeção válida até'
    when 'extintor_validade' then 'Extintor válido até'
    when 'proxima_data_iuc' then 'IUC a pagar até'
    when 'data_inicio' then 'Início'
    when 'data_fim' then 'Fim'
    when 'criado_em' then 'Aberto em'
    else upper(left(replace(p_chave, '_', ' '), 1)) || substr(replace(p_chave, '_', ' '), 2)
  end
$$;

revoke all on function public.rotulo_campo_aviso(text) from public, anon;

CREATE OR REPLACE FUNCTION "public"."enviar_digests_diarios"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_grupo record;
  v_notification_id uuid;
begin
  for v_grupo in
    select
      n.org_id,
      n.destinatario_user_id,
      u.email,
      count(*)::int as total,
      array_agg(n.id) as notif_ids,
      -- Cada aviso: o título numa linha e os campos "Etiqueta: valor" por baixo,
      -- um por linha; avisos separados por uma linha em branco. Texto simples:
      -- o modelo usa {{lista}}, que o envio escapa.
      string_agg(
        n.titulo || coalesce(
          chr(10) || nullif(
            coalesce(
              nullif(regexp_replace(n.mensagem, '\s+[—–]\s+', ', ', 'g'), ''),
              (
                select string_agg(
                  public.rotulo_campo_aviso(kv.key) || ': ' ||
                    case
                      when kv.value ~ '^\d{4}-\d{2}-\d{2}' then
                        substring(kv.value from 9 for 2) || '/' || substring(kv.value from 6 for 2) || '/' || substring(kv.value from 1 for 4)
                      else left(regexp_replace(kv.value, '\s+[—–]\s+', ', ', 'g'), 80)
                    end,
                  chr(10)
                  order by kv.key
                )
                from jsonb_each_text(n.payload) kv
                where kv.key not in ('link', 'mensagem')
                  and kv.key !~ '_id$'
                  and jsonb_typeof(n.payload -> kv.key) in ('string', 'number', 'boolean')
                  and kv.value is not null
                  and kv.value !~ '^\s*[—–]?\s*$'
              )
            ),
            ''
          ),
          ''
        ),
        chr(10) || chr(10) order by n.created_at
      ) as lista_html
    from public.notifications n
    join public.automation_runs r on r.id = n.rule_run_id
    join public.automation_rules ar on ar.id = r.rule_id
    join auth.users u on u.id = n.destinatario_user_id
    where n.digest_enviado_em is null
      and coalesce((ar.acao_config->>'enviar_email_digest')::boolean, false) = true
    group by n.org_id, n.destinatario_user_id, u.email
  loop
    if v_grupo.email is null then
      continue;
    end if;

    insert into public.notifications (org_id, destinatario_user_id, template_codigo, titulo, mensagem, payload)
    values (
      v_grupo.org_id,
      v_grupo.destinatario_user_id,
      'digest.resumo_diario',
      'Resumo diário de automações',
      v_grupo.total || ' aviso(s) novo(s)',
      jsonb_build_object('total', v_grupo.total, 'lista', v_grupo.lista_html)
    )
    returning id into v_notification_id;

    insert into public.notification_queue (notification_id, org_id, canal, destinatario, template_codigo, payload_render)
    values (
      v_notification_id,
      v_grupo.org_id,
      'email',
      v_grupo.email,
      'digest.resumo_diario',
      jsonb_build_object('total', v_grupo.total, 'lista', v_grupo.lista_html)
    );

    update public.notifications
    set digest_enviado_em = now()
    where id = any(v_grupo.notif_ids);
  end loop;
end;
$$;

-- 5) Os modelos de email, em linhas e sem travessões ---------------------------
-- Cada linha "Etiqueta: valor" vira uma linha de tabela no email (formatarCorpo).
-- As sementes por organização continuam iguais; esta função escreve por cima
-- dos textos delas, agora e sempre que nasce uma organização.

create or replace function public.aplicar_textos_padrao_email(p_org_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.notification_templates t
     set assunto = v.assunto,
         corpo_template = v.corpo,
         updated_at = now()
    from (values
      ('assistencia.ticket_aberto_gestor',
       'Ticket aberto na viatura {{matricula}} (contrato {{contrato}})',
       E'Foi aberto um ticket de assistência numa viatura de um contrato teu.\n\nViatura: {{matricula}}\nContrato: {{contrato}}\nAssunto: {{titulo}}\nCategoria: {{categoria}}\nPrioridade: {{prioridade}}\n\nDescrição: {{descricao}}'),
      ('assistencia.ticket_resolvido_criador',
       'O teu ticket foi resolvido: {{titulo}}',
       E'O ticket de assistência que abriste foi marcado como resolvido.\n\nTicket: #{{numero}}\nAssunto: {{titulo}}\nViatura: {{matricula}}\n\nDescrição: {{descricao}}'),
      ('assistencia_ticket.aberto_demasiado_tempo',
       'Ticket #{{numero}} ({{matricula}}) aberto há mais de 7 dias',
       E'Este ticket está aberto há mais de 7 dias sem resolução. Confirma o ponto de situação.\n\nTicket: #{{numero}}\nAssunto: {{titulo}}\nViatura: {{matricula}}\nPrioridade: {{prioridade}}\nEstado: {{status}}\nAberto em: {{criado_em}}'),
      ('cartao_frota.alterado',
       'Cartão {{tipo_label}} nº {{numero}} alterado',
       E'O cartão {{tipo_label}} nº {{numero}} foi alterado por {{alterado_por}}.\n\n<b>Antes</b>\n{{antes_texto}}\n\n<b>Agora</b>\n{{depois_texto}}\n\nSe o titular mudou, confirme a data de fecho do período anterior: é ela que decide a quem é imputado o combustível.'),
      ('contrato.alterado',
       'Contrato nº {{numero_contrato}} de {{motorista}} alterado',
       E'O contrato nº {{numero_contrato}} de {{motorista}} foi alterado por {{alterado_por}}.\n\nViatura: {{viatura}}\nEmpresa: {{empresa}}\nEstado: {{status}}\n\n<b>Antes</b>\n{{antes_texto}}\n\n<b>Agora</b>\n{{depois_texto}}'),
      ('contrato_renting.criado',
       'Novo contrato {{codigo}} com {{cliente_nome}} ({{matricula}})',
       E'Foi criado um novo contrato de renting.\n\nContrato: {{codigo}}\nCliente: {{cliente_nome}}\nViatura: {{matricula}}\nRegime: {{regime}}\nInício: {{data_inicio}}'),
      ('contrato_renting.fechado_com_danos',
       'Contrato {{codigo}} ({{matricula}}) fechado com danos',
       E'O contrato foi fechado e a recolha trouxe registo de danos.\n\nContrato: {{codigo}}\nViatura: {{matricula}}\nCliente: {{cliente_nome}}\nPeríodo: {{data_inicio}} a {{data_fim}}\nKm de entrada: {{km_entrada}}\n\nDanos: {{dano_descricao}}\nObservações: {{dano_observacoes}}'),
      ('contrato_renting.renovacao_proxima',
       'Contrato {{codigo}} ({{matricula}}) a atingir a data de renovação',
       E'Este contrato de renting chega à data de renovação. Confirma se a renovação já foi preparada.\n\nContrato: {{codigo}}\nCliente: {{cliente_nome}}\nViatura: {{matricula}}\nData de renovação: {{prazo}}'),
      ('contrato_renting.sem_checkin',
       'Devolução em atraso: contrato {{codigo}} ({{matricula}})',
       E'Este contrato devia ter sido devolvido e ainda não tem check-in registado.\n\nContrato: {{codigo}}\nCliente: {{cliente_nome}}\nViatura: {{matricula}}\nDevolução prevista: {{data_fim}}'),
      ('digest.resumo_diario',
       'Resumo diário: {{total}} aviso(s) novo(s)',
       E'Tens {{total}} aviso(s) novo(s) hoje.\n\n{{lista}}'),
      ('invoice.nao_enviada_ao_cliente',
       'Fatura {{numero}} emitida há mais de 3 dias sem ser enviada',
       E'Esta fatura ainda não foi enviada ao cliente. Confirma o envio em Renting → Contrato → Faturar.\n\nFatura: {{numero}}\nTotal: {{total}} €\nNIF do cliente: {{cliente_nif}}\nEmitida em: {{data_emissao}}'),
      ('motorista.candidatura_parada',
       'Candidatura de {{nome}} parada há mais de 3 dias',
       E'Esta candidatura está parada há mais de 3 dias, sem decisão final. Confirma se já foi tratada.\n\nCandidato: {{nome}}\nEmail: {{email}}\nEstado: {{status}}\nSubmetida em: {{data_submissao}}'),
      ('motorista.carta_expirando',
       'Carta de condução de {{nome}} a expirar',
       E'A carta de condução deste motorista está a expirar. Confirma que a renovação está a ser tratada antes de atribuir novos contratos.\n\nMotorista: {{nome}}\nCarta válida até: {{carta_validade}}'),
      ('motorista.documento_enviado',
       '{{motorista_nome}} enviou um documento para aprovação',
       E'Um motorista enviou um documento que aguarda validação. Depois de aprovado, substitui o documento actual na ficha.\n\nMotorista: {{motorista_nome}}\nDocumento: {{documento_label}}\nFicheiro: {{nome_ficheiro}}\nEnviado em: {{enviado_em}}'),
      ('motorista.ficha_incompleta',
       'Falta completares a tua ficha, {{nome}}',
       E'Olá {{nome}}, a tua ficha ainda tem dados em falta. Conclui o preenchimento no teu perfil para evitar bloqueios em contratos e pagamentos.\n\nEm falta: {{campos_em_falta}}'),
      ('motorista.km_enviado',
       '{{motorista_nome}} registou {{km}} km ({{matricula}})',
       E'O motorista fotografou o conta-quilómetros e o km da viatura foi actualizado.\n\nMotorista: {{motorista_nome}}\nViatura: {{matricula}}\nKm confirmado: {{km}}\nLeitura automática: {{km_lido}}\nKm anterior: {{km_anterior}}\nEnviado em: {{enviado_em}}'),
      ('motorista.licenca_tvde_expirando',
       'Licença TVDE de {{nome}} a expirar',
       E'A licença TVDE deste motorista está a expirar. Confirma que a renovação está a ser tratada antes de atribuir novos contratos.\n\nMotorista: {{nome}}\nLicença válida até: {{licenca_tvde_validade}}'),
      ('motorista.recibo_verde_enviado',
       '{{motorista_nome}} submeteu um recibo verde ({{periodo}})',
       E'Um recibo verde aguarda validação.\n\nMotorista: {{motorista_nome}}\nPeríodo: {{periodo}}\nValor: {{valor}} €\nEnviado em: {{enviado_em}}'),
      ('motorista.reparacao_cobranca',
       'Reparação da viatura {{matricula}}: tens {{valor}} € a pagar',
       E'A reparação ficou concluída com um valor a teu cargo. Consulta o teu extrato financeiro para mais detalhes.\n\nViatura: {{matricula}}\nReparação: {{descricao}}\nValor: {{valor}} €'),
      ('plataforma.semana_em_falta',
       'Faltam semanas de dados na {{integracao_nome}}',
       E'A integração {{integracao_nome}} ({{plataforma}}) não tem dados para algumas semanas. Ou o ficheiro dessas semanas nunca foi carregado, ou a sincronização falhou. As semanas à volta têm dados.\n\nSemanas em falta: {{semanas_texto}}'),
      ('seguranca.login_suspeito',
       'Tentativas de login suspeitas para {{email}}',
       E'Foram detetadas tentativas de login falhadas. Se não reconheces esta atividade, considera repor a palavra-passe deste utilizador.\n\nUtilizador: {{email}}\nTentativas: {{tentativas}}\nPeríodo: últimos {{janela_minutos}} minutos'),
      ('sistema.job_falhou',
       'Falha num job agendado ({{job_type}})',
       E'Um job agendado falhou definitivamente. Ver detalhes em Automação → Falhas.\n\nFonte: {{source_table}}\nTipo: {{job_type}}\nErro: {{last_error}}'),
      ('viatura.extintor_expirando',
       'Extintor da viatura {{matricula}} a expirar',
       E'O extintor desta viatura está a expirar. Confirma se a substituição já está tratada.\n\nViatura: {{matricula}}\nExtintor válido até: {{extintor_validade}}'),
      ('viatura.inspecao_expirando',
       'Inspeção periódica (IPO) da viatura {{matricula}} a expirar',
       E'A inspeção periódica (IPO) desta viatura está a expirar. Agenda a inspeção antes da data.\n\nViatura: {{matricula}}\nInspeção válida até: {{inspecao_validade}}'),
      ('viatura.iuc_a_pagar',
       'IUC da viatura {{matricula}} a pagar',
       E'O IUC desta viatura está a vencer. Confirma se o pagamento já está preparado.\n\nViatura: {{matricula}} ({{marca}} {{modelo}})\nIUC a pagar até: {{proxima_data_iuc}}'),
      ('viatura.manutencao_preventiva_expirando',
       'Manutenção preventiva da viatura {{matricula}} a aproximar-se',
       E'Esta viatura está a aproximar-se da próxima manutenção preventiva. Agenda a revisão.\n\nViatura: {{matricula}}\nPróxima revisão: {{proxima_manutencao_data}}\nPróxima revisão (km): {{proxima_manutencao_km}}\nKm actual: {{km_atual}}'),
      ('viatura.seguro_expirando',
       'Seguro da viatura {{matricula}} a expirar',
       E'O seguro desta viatura está a expirar. Confirma se a renovação já está tratada.\n\nViatura: {{matricula}}\nSeguro válido até: {{seguro_validade}}')
    ) as v(codigo, assunto, corpo)
   where t.org_id = p_org_id
     and t.canal = 'email'
     and t.codigo = v.codigo;
$$;

revoke all on function public.aplicar_textos_padrao_email(uuid) from public, anon, authenticated;

-- Corre depois das sementes: os gatilhos AFTER INSERT disparam por ordem
-- alfabética do nome, e os das sementes chamam-se trg_* e trigger_*.
create or replace function public.tg_aplicar_textos_padrao_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.aplicar_textos_padrao_email(new.id);
  return new;
end $$;

revoke all on function public.tg_aplicar_textos_padrao_email() from public, anon, authenticated;

drop trigger if exists zz_textos_padrao_email on public.organizacoes;
create trigger zz_textos_padrao_email
  after insert on public.organizacoes
  for each row execute function public.tg_aplicar_textos_padrao_email();

-- Organizações que já existem.
select public.aplicar_textos_padrao_email(o.id) from public.organizacoes o;

-- Cópias dos modelos de cartão e contrato feitas pelo editor de regras, ainda
-- com o texto antigo de uma linha só.
update public.notification_templates t
   set corpo_template = p.corpo_template,
       updated_at = now()
  from public.notification_templates p
 where p.org_id = t.org_id
   and p.canal = 'email'
   and t.canal = 'email'
   and p.codigo in ('cartao_frota.alterado', 'contrato.alterado')
   and t.codigo like p.codigo || '.%'
   and t.corpo_template like '%{{alteracoes_texto}}%';

notify pgrst, 'reload schema';
