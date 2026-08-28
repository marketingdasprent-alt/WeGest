-- ============================================================================
-- MVP — Automações internas: uma acção, três módulos
-- ============================================================================
--
-- O motor sabia notificar. Passa a saber agir: escrever numa observação,
-- mudar o estado de um ticket. Uma acção por automação, sem passos nem
-- sequências.
--
-- ── ZERO SCHEMA NOVO ────────────────────────────────────────────────────────
--
-- O CHECK de `acao_tipo` já aceitava 'automacao_interna' e nunca foi usado.
-- Uma automação interna é uma regra com esse tipo e:
--
--   acao_config = { "accao": "ticket.alterar_estado", "valor": "em_andamento" }
--
-- Nenhuma tabela, nenhuma coluna, nenhum CHECK de tipo alterado. O snapshot da
-- Fase 3 congela isto de graça, porque já congela `acao_config` inteira.
--
-- ── PORQUE `CASE` E NÃO DESPACHO DINÂMICO ───────────────────────────────────
--
-- Para três acções, um `case` é mais fácil de ler, testar e auditar do que
-- `execute format(...)` — e elimina de vez a pergunta «pode a configuração
-- escolher que função corre». Aqui não há SQL dinâmico nenhum: o utilizador
-- escolhe uma chave de um conjunto fechado, e o `case` é exaustivo com `else`
-- que levanta excepção.
--
-- O `case` vive em `fn_executar_accao_interna`, não no executor. Acrescentar
-- uma acção é um handler novo, uma linha no `case` e uma entrada no catálogo —
-- `execute_automation_runs` e `process_domain_events` não são tocados.
--
-- ── IDEMPOTÊNCIA: `IS DISTINCT FROM`, E PORQUÊ ──────────────────────────────
--
-- Auditados os triggers de UPDATE campo a campo:
--
--   viaturas.observacoes            nenhum trigger (os três são por coluna:
--                                   status, marca_id/modelo_id, tipo_id/is_slot)
--   motoristas_ativos.observacoes   4 triggers, mas o histórico só grava se
--                                   `status_ativo` mudar — não é o caso
--   assistencia_tickets.status      só `updated_at`; o aviso ao gestor é
--                                   AFTER INSERT, não UPDATE
--
-- Ou seja, os triggers desta base já estão escritos com guarda. O
-- `where campo is distinct from valor` fica na mesma, e a razão é outra:
-- torna a idempotência do handler INDEPENDENTE da disciplina dos triggers
-- futuros. Hoje estão bem escritos; o próximo pode não estar. Com o guarda, um
-- retry actualiza zero linhas e nenhum trigger chega a correr.
--
-- ── TENANCY NO PRÓPRIO HANDLER ──────────────────────────────────────────────
--
-- Cada handler filtra por `org_id` além do `id`, mesmo sabendo que o run já é
-- da organização certa. É defesa em profundidade: se um dia um caminho novo
-- criar um run com o `entity_id` errado, o handler não escreve na entidade de
-- outra organização — falha em silêncio com zero linhas, que é o correcto.
-- ============================================================================

-- ── 1. O log tem de saber dizer "regra_falhou" ──────────────────────────────
-- Pré-condição do passo 2. A lista é fechada; sem esta entrada o registo da
-- falha levantaria `check_violation` e derrubaria o evento — que é exactamente
-- o bug que o passo 2 existe para fechar.
alter table public.automation_logs drop constraint if exists automation_logs_evento_check;

alter table public.automation_logs
  add constraint automation_logs_evento_check
  check (evento in (
    'executada',
    'falhou',
    'ignorada_cooldown',
    'condicao_nao_satisfeita',
    'ignorada_aviso_em_aberto',
    'condicao_invalida',
    'regra_falhou'
  ));

-- ── 2. Isolamento por REGRA ─────────────────────────────────────────────────
--
-- A Fase 1 isolou os eventos uns dos outros. Dentro de um evento, porém, uma
-- excepção inesperada numa regra continua a reverter as outras: foi assim que
-- um defeito da Fase 4 se manifestou, com a regra válida do mesmo evento a
-- perder o seu run na reversão.
--
-- Com acções a escrever em tabelas de domínio, esse raio de dano cresce. A
-- correcção é o mesmo padrão que a Fase 1 usa por evento, um nível abaixo.
--
-- Não é `when others` silencioso: regista `regra_falhou` com o erro e o id do
-- evento. O que se perde é a regra; o que se ganha é o evento e as outras
-- regras dele.
do $$
declare
  v_src   text;
  v_novo  text;
  v_antes text;
  v_pares text[][] := array[
    array[
      E'      loop\n        -- Fase 4: configuração inválida salta a REGRA, não o evento.',
      E'      loop\n      -- MVP: sub-transacção por REGRA. Uma regra que rebente não leva as\n      -- outras do mesmo evento, nem o próprio evento.\n      begin\n        -- Fase 4: configuração inválida salta a REGRA, não o evento.'
    ],
    array[
      E'          null; -- já há um run ativo para esta regra+entidade — nada a fazer.\n        end;\n      end loop;',
      E'          null; -- já há um run ativo para esta regra+entidade — nada a fazer.\n        end;\n\n      exception when others then\n        insert into public.automation_logs (rule_id, org_id, evento, detalhe)\n        values (v_rule.id, v_rule.org_id, ''regra_falhou'',\n                jsonb_build_object(''event_id'', v_event.id, ''erro'', sqlerrm));\n      end;\n      end loop;'
    ]
  ];
  i int;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname = 'process_domain_events';

  if v_src is null then
    raise exception 'process_domain_events não existe — cadeia de migrações fora de ordem';
  end if;

  v_novo := v_src;
  for i in 1 .. array_length(v_pares, 1) loop
    v_antes := v_novo;
    v_novo := replace(v_novo, v_pares[i][1], v_pares[i][2]);
    if v_novo = v_antes then
      raise exception 'Cirurgia %/% em process_domain_events não casou.', i, array_length(v_pares, 1)
        using hint = 'Comparar com pg_get_functiondef. Nada foi alterado.';
    end if;
  end loop;

  if v_novo not like '%regra_falhou%' then
    raise exception 'O laço das regras ficou sem o registo de falha.';
  end if;

  execute v_novo;
end $$;

revoke all on function public.process_domain_events(integer) from public, anon, authenticated;
grant execute on function public.process_domain_events(integer) to service_role;

-- ── 3. O catálogo ───────────────────────────────────────────────────────────
--
-- Uma função, não uma tabela: são metadados estáticos que não variam por
-- organização. Uma tabela traria políticas RLS, seed e sincronização com o
-- código dos handlers sem resolver nada.
--
-- Dois eixos separados, e a separação é o ponto: as CONDIÇÕES pertencem ao
-- EVENTO (avaliam o payload dele) e as ACÇÕES pertencem à ENTIDADE. Misturá-los
-- levava a listar colunas da entidade como campos de condição — que não é o que
-- o motor avalia.
--
-- Os campos de cada evento saem dos payloads reais que já circulam, não do
-- schema das tabelas.
create or replace function public.automation_catalogo()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'eventos', jsonb_build_object(
      'assistencia_ticket.aberto_demasiado_tempo', jsonb_build_object(
        'label',  'Ticket aberto há demasiado tempo',
        'modulo', 'Assistência',
        'campos', jsonb_build_array(
          jsonb_build_object('id','prioridade','label','Prioridade','tipo','string'),
          jsonb_build_object('id','status',    'label','Estado',    'tipo','string')
        )
      ),
      'motorista.ficha_incompleta', jsonb_build_object(
        'label',  'Ficha de motorista incompleta',
        'modulo', 'Motoristas',
        'campos', jsonb_build_array(
          jsonb_build_object('id','nome','label','Nome','tipo','string')
        )
      ),
      'viatura.seguro_expirando', jsonb_build_object(
        'label',  'Seguro da viatura a expirar',
        'modulo', 'Viaturas',
        'campos', jsonb_build_array(
          jsonb_build_object('id','matricula','label','Matrícula','tipo','string')
        )
      )
    ),
    'accoes', jsonb_build_object(
      'motorista.atualizar_campo', jsonb_build_object(
        'label',   'Preencher um campo do motorista',
        'modulo',  'Motoristas',
        'recurso', 'motoristas_editar',
        'campos_permitidos', jsonb_build_array('observacoes')
      ),
      'viatura.atualizar_campo', jsonb_build_object(
        'label',   'Preencher um campo da viatura',
        'modulo',  'Viaturas',
        'recurso', 'viaturas_editar',
        'campos_permitidos', jsonb_build_array('observacoes')
      ),
      'ticket.alterar_estado', jsonb_build_object(
        'label',   'Alterar o estado do ticket',
        'modulo',  'Assistência',
        'recurso', 'tickets_gerir',
        'valores', jsonb_build_array('pendente','aberto','em_andamento','aguardando','resolvido','fechado')
      )
    )
  );
$$;

comment on function public.automation_catalogo() is
  'Fonte única do que é automatizável: eventos (com os campos do payload e o seu tipo) e acções (com permissão e configuração permitida). Lido pelo editor, pelo validador e pelo despacho.';

revoke all on function public.automation_catalogo() from public, anon;
grant execute on function public.automation_catalogo() to authenticated, service_role;

-- ── 4. Handlers ─────────────────────────────────────────────────────────────
--
-- Assinatura comum: (org_id, entity_id, config) → jsonb com o que aconteceu.
-- O `linhas` devolvido é o que prova a idempotência num teste: 1 na primeira
-- execução, 0 no retry.
--
-- A allowlist é verificada aqui além de o ser na escrita. Redundante por
-- desenho: o validador impede a configuração má de ser gravada, o handler
-- impede-a de ser executada se alguma vez lá chegar por outro caminho.

create or replace function public.fn_accao_motorista_atualizar_campo(
  p_org_id uuid, p_entity_id uuid, p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campo  text := p_config->>'campo';
  v_valor  text := p_config->>'valor';
  v_linhas integer;
begin
  if v_campo is distinct from 'observacoes' then
    raise exception 'campo "%" não é permitido em motorista.atualizar_campo', coalesce(v_campo, '(nulo)')
      using errcode = 'check_violation';
  end if;

  -- Sem SQL dinâmico: com um campo na allowlist, a coluna é literal. Quando
  -- houver um segundo, isto passa a `case`, não a `execute`.
  update public.motoristas_ativos
     set observacoes = v_valor
   where id = p_entity_id
     and org_id = p_org_id
     and observacoes is distinct from v_valor;

  get diagnostics v_linhas = row_count;
  return jsonb_build_object('accao', 'motorista.atualizar_campo', 'campo', v_campo, 'linhas', v_linhas);
end;
$$;

create or replace function public.fn_accao_viatura_atualizar_campo(
  p_org_id uuid, p_entity_id uuid, p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campo  text := p_config->>'campo';
  v_valor  text := p_config->>'valor';
  v_linhas integer;
begin
  if v_campo is distinct from 'observacoes' then
    raise exception 'campo "%" não é permitido em viatura.atualizar_campo', coalesce(v_campo, '(nulo)')
      using errcode = 'check_violation';
  end if;

  update public.viaturas
     set observacoes = v_valor
   where id = p_entity_id
     and org_id = p_org_id
     and observacoes is distinct from v_valor;

  get diagnostics v_linhas = row_count;
  return jsonb_build_object('accao', 'viatura.atualizar_campo', 'campo', v_campo, 'linhas', v_linhas);
end;
$$;

create or replace function public.fn_accao_ticket_alterar_estado(
  p_org_id uuid, p_entity_id uuid, p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_valor  text := p_config->>'valor';
  v_linhas integer;
begin
  -- Os seis valores são os do CHECK da própria tabela. Verificar aqui dá uma
  -- mensagem útil em vez de um erro de constraint vindo do fundo.
  if v_valor is null or not (v_valor = any (array['pendente','aberto','em_andamento','aguardando','resolvido','fechado'])) then
    raise exception 'estado "%" não é válido para um ticket', coalesce(v_valor, '(nulo)')
      using errcode = 'check_violation';
  end if;

  update public.assistencia_tickets
     set status = v_valor
   where id = p_entity_id
     and org_id = p_org_id
     and status is distinct from v_valor;

  get diagnostics v_linhas = row_count;
  return jsonb_build_object('accao', 'ticket.alterar_estado', 'valor', v_valor, 'linhas', v_linhas);
end;
$$;

-- ── 5. Despacho ─────────────────────────────────────────────────────────────
-- `case` exaustivo com `else` que levanta. Uma acção fora do conjunto não
-- corre — e nem chega aqui, porque o validador já a recusou na escrita.
create or replace function public.fn_executar_accao_interna(
  p_org_id uuid, p_entity_id uuid, p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_accao text := p_config->>'accao';
begin
  if p_entity_id is null then
    raise exception 'acção interna sem entidade sobre que agir';
  end if;

  case v_accao
    when 'motorista.atualizar_campo' then
      return public.fn_accao_motorista_atualizar_campo(p_org_id, p_entity_id, p_config);
    when 'viatura.atualizar_campo' then
      return public.fn_accao_viatura_atualizar_campo(p_org_id, p_entity_id, p_config);
    when 'ticket.alterar_estado' then
      return public.fn_accao_ticket_alterar_estado(p_org_id, p_entity_id, p_config);
    else
      raise exception 'acção interna "%" desconhecida', coalesce(v_accao, '(nula)')
        using errcode = 'check_violation';
  end case;
end;
$$;

revoke all on function public.fn_accao_motorista_atualizar_campo(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.fn_accao_viatura_atualizar_campo(uuid, uuid, jsonb)   from public, anon, authenticated;
revoke all on function public.fn_accao_ticket_alterar_estado(uuid, uuid, jsonb)     from public, anon, authenticated;
revoke all on function public.fn_executar_accao_interna(uuid, uuid, jsonb)          from public, anon, authenticated;
grant execute on function public.fn_accao_motorista_atualizar_campo(uuid, uuid, jsonb) to service_role;
grant execute on function public.fn_accao_viatura_atualizar_campo(uuid, uuid, jsonb)   to service_role;
grant execute on function public.fn_accao_ticket_alterar_estado(uuid, uuid, jsonb)     to service_role;
grant execute on function public.fn_executar_accao_interna(uuid, uuid, jsonb)          to service_role;

-- ── 6. Validação na escrita ─────────────────────────────────────────────────
--
-- Acrescentada ao validador que já existe, `fn_validar_acao_config`, e não num
-- segundo sistema paralelo. O corpo do ramo 'notificacao' é copiado tal e qual
-- da versão viva; o que muda é o início, que passa a bifurcar por tipo.
--
-- A permissão é verificada aqui — no momento de gravar — e não na execução. O
-- executor corre como service_role sem utilizador; revalidar a cada execução
-- obrigaria a personificar alguém que pode já nem existir. Consequência
-- explícita: depois de gravada, a automação executa como capacidade da
-- ORGANIZAÇÃO. Se quem a criou perder a permissão, ela continua até ser
-- desactivada ou editada.
--
-- `auth.uid()` nulo significa contexto de sistema (seed, migração,
-- service_role) e não é bloqueado — quem lá chega já pode tudo.
create or replace function public.fn_validar_acao_config()
returns trigger
language plpgsql
as $function$
declare
  v_estrategia text;
  v_modo text;
  v_accao text;
  v_def jsonb;
  v_campo text;
begin
  -- ── Automações internas ───────────────────────────────────────────────
  if new.acao_tipo = 'automacao_interna' then
    if TG_OP = 'UPDATE' and new.acao_config is not distinct from old.acao_config then
      return new;
    end if;

    v_accao := new.acao_config->>'accao';
    v_def   := public.automation_catalogo() -> 'accoes' -> v_accao;

    if v_def is null then
      raise exception 'acao_config inválido: acção interna "%" não existe no catálogo.', coalesce(v_accao, '(nula)')
        using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
    end if;

    if not (new.acao_config ? 'valor') then
      raise exception 'acao_config inválido: a acção "%" precisa de um valor.', v_accao
        using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
    end if;

    -- Allowlist de campos, quando a acção escreve num campo.
    if v_def ? 'campos_permitidos' then
      v_campo := new.acao_config->>'campo';
      if v_campo is null or not (v_def->'campos_permitidos' @> to_jsonb(v_campo)) then
        raise exception 'acao_config inválido: campo "%" não é permitido em "%".', coalesce(v_campo, '(nulo)'), v_accao
          using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
      end if;
    end if;

    -- Conjunto fechado de valores, quando a acção o tem.
    if v_def ? 'valores' and not (v_def->'valores' @> to_jsonb(new.acao_config->>'valor')) then
      raise exception 'acao_config inválido: valor "%" não é aceite por "%".', new.acao_config->>'valor', v_accao
        using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
    end if;

    -- Permissão de quem grava, contra o RBAC que já existe.
    if auth.uid() is not null and not public.can_edit(auth.uid(), v_def->>'recurso') then
      raise exception 'sem permissão "%" para configurar a acção "%".', v_def->>'recurso', v_accao
        using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
    end if;

    return new;
  end if;

  -- ── Notificações (inalterado) ─────────────────────────────────────────
  if new.acao_tipo <> 'notificacao' then
    return new;
  end if;

  if TG_OP = 'UPDATE' and new.acao_config is not distinct from old.acao_config then
    return new;
  end if;

  if not (new.acao_config ? 'template_codigo') or btrim(coalesce(new.acao_config->>'template_codigo', '')) = '' then
    raise exception 'acao_config inválido: template_codigo é obrigatório.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  if not (new.acao_config ? 'titulo') or btrim(coalesce(new.acao_config->>'titulo', '')) = '' then
    raise exception 'acao_config inválido: titulo é obrigatório.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  v_estrategia := new.acao_config->>'destinatarios_estrategia';
  if v_estrategia is not null and v_estrategia not in ('cargo', 'gestor_responsavel', 'motorista') then
    raise exception 'acao_config inválido: destinatarios_estrategia "%" desconhecido.', v_estrategia
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  if new.acao_config ? 'destinatarios_cargo_ids' and jsonb_typeof(new.acao_config->'destinatarios_cargo_ids') <> 'array' then
    raise exception 'acao_config inválido: destinatarios_cargo_ids tem de ser um array.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  if new.acao_config ? 'destinatarios_user_ids' and jsonb_typeof(new.acao_config->'destinatarios_user_ids') <> 'array' then
    raise exception 'acao_config inválido: destinatarios_user_ids tem de ser um array.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  v_modo := new.acao_config->>'destinatarios_modo';
  if v_modo is not null and v_modo not in ('grupo', 'individual') then
    raise exception 'acao_config inválido: destinatarios_modo "%" desconhecido.', v_modo
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  if new.acao_config ? 'enviar_email' and jsonb_typeof(new.acao_config->'enviar_email') <> 'boolean' then
    raise exception 'acao_config inválido: enviar_email tem de ser boolean.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  if new.acao_config ? 'enviar_email_digest' and jsonb_typeof(new.acao_config->'enviar_email_digest') <> 'boolean' then
    raise exception 'acao_config inválido: enviar_email_digest tem de ser boolean.'
      using ERRCODE = 'check_violation', HINT = 'Validação acao_config (automation_rules)';
  end if;

  return new;
end;
$function$;

-- ── 7. O executor despacha ──────────────────────────────────────────────────
--
-- Uma substituição, no ramo que hoje diz «não é notificação, conclui e segue».
-- Se o handler levantar, o `exception when others` do executor trata disso
-- como qualquer outra falha de run: `automation_runs_fail`, backoff e
-- dead-letter. Não é preciso caminho novo.
do $$
declare
  v_src  text;
  v_novo text;
  v_proc constant text := E'      if v_rule.acao_tipo <> ''notificacao'' then\n        perform public.automation_runs_complete(v_run.id);\n        continue;\n      end if;';
  v_sub  constant text := E'      if v_rule.acao_tipo = ''automacao_interna'' then\n        perform public.automation_runs_complete(\n          v_run.id,\n          public.fn_executar_accao_interna(v_run.org_id, v_run.entity_id, v_rule.acao_config));\n        continue;\n      end if;\n\n      if v_rule.acao_tipo <> ''notificacao'' then\n        perform public.automation_runs_complete(v_run.id);\n        continue;\n      end if;';
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname = 'execute_automation_runs';

  if v_src is null then
    raise exception 'execute_automation_runs não existe — cadeia fora de ordem';
  end if;

  v_novo := replace(v_src, v_proc, v_sub);

  if v_novo = v_src then
    raise exception 'Cirurgia em execute_automation_runs não casou.'
      using hint = 'Comparar com pg_get_functiondef. Nada foi alterado.';
  end if;

  if v_novo not like '%fn_executar_accao_interna%' then
    raise exception 'O executor ficou sem o despacho de acções internas.';
  end if;

  execute v_novo;
end $$;

revoke all on function public.execute_automation_runs(integer) from public, anon, authenticated;
grant execute on function public.execute_automation_runs(integer) to service_role;
