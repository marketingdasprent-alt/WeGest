-- ============================================================================
-- Fase 2 — Idempotência dos efeitos do motor de automação
-- ============================================================================
--
-- O PROBLEMA
--
--   run reclamado → efeitos persistidos → worker morre antes de concluir
--   → sweep devolve o run a pending → retry volta a persistir os efeitos
--
-- Os três efeitos: `notifications` (pai do pipeline de email), `notificacoes`
-- (o que o utilizador vê, dual-write legado) e `notification_queue`.
--
-- ── ESTADO DE PRODUÇÃO, ANTES DE CRIAR QUALQUER CONSTRAINT ──────────────────
--
--   notifications       67 075 linhas   0 conflitos (rule_run_id, destinatario_user_id)
--   notification_queue   2 467 linhas   0 conflitos (notification_id, canal, destinatario)
--   notificacoes        sem a coluna → nasce NULL, sem conflito possível
--
-- Nada é apagado nem alterado. As notificações históricas ficam com
-- `rule_run_id` a NULL e o índice parcial ignora-as — não se inventa a
-- posteriori a que run pertenceram.
--
-- ── O ÍNDICE, E NÃO UM `SELECT ... IF NOT EXISTS` ───────────────────────────
--
-- Dois workers fazem o SELECT, ambos não encontram nada, ambos inserem. A
-- garantia tem de estar no banco: o `on conflict` do executor serve para o
-- retry ser silencioso, mas quem impede a duplicação sob concorrência é o
-- índice único.
--
-- ── `DO UPDATE` E NÃO `DO NOTHING` EM notifications ─────────────────────────
--
-- O ponto menos óbvio, e vem da falha PARCIAL:
--
--   1.ª tentativa:  notifications ✓   notificacoes ✓   queue ✗ (morreu aqui)
--   retry:          notifications —   notificacoes —   queue DEVE acontecer
--
-- Com `do nothing`, o `returning id into v_notification_id` devolveria NULL no
-- retry e o insert na fila — que só corre quando há notificação deste run —
-- seria saltado. A fila ficaria para sempre incompleta. O `do update` escreve
-- a coluna com o valor que já tinha, só para o `returning` devolver o id
-- existente.
-- ============================================================================

-- ── 1. notificacoes ganha a identidade do run ───────────────────────────────
-- Nullable de propósito: nem toda a notificação vem do motor. Alertas directos,
-- escalonamentos e o que o frontend escreve continuam sem run, e o índice
-- parcial deixa-os em paz.
alter table public.notificacoes
  add column if not exists rule_run_id uuid references public.automation_runs(id) on delete set null;

comment on column public.notificacoes.rule_run_id is
  'Execução do motor que produziu esta linha. NULL para notificações que não vêm do motor. Base da idempotência: um run não pode contribuir duas vezes para o mesmo destinatário.';

-- ── 2. Os três índices de identidade ────────────────────────────────────────
create unique index if not exists idx_notifications_idem_run_destinatario
  on public.notifications (rule_run_id, destinatario_user_id)
  where rule_run_id is not null;

create unique index if not exists idx_notificacoes_idem_run_destinatario
  on public.notificacoes (rule_run_id, destinatario_id)
  where rule_run_id is not null;

-- Sem `where`: `notification_id` é NOT NULL nesta tabela, portanto não há
-- linhas a excluir. A identidade é a notificação, o canal e o destinatário —
-- a mesma notificação pode legitimamente gerar email E sms.
create unique index if not exists idx_notification_queue_idem
  on public.notification_queue (notification_id, canal, destinatario);

-- ── 3. O agrupamento passa a reconhecer um run já aplicado ──────────────────
--
-- `fn_notificacoes_agrupar` é BEFORE INSERT e, no caminho de agrupamento,
-- CANCELA o insert e funde na linha existente (`agrupadas + 1`, acrescenta a
-- `itens`). Nesse caminho o índice único nunca dispara — não há insert.
--
-- Resultado sem esta alteração: o retry não cria linha nova, mas incrementa o
-- contador e repete o item. O utilizador vê "3 avisos" onde houve 2 eventos.
-- É duplicação na mesma, só que expressa de outra maneira.
--
-- A única mudança em relação à versão viva: `rule_run_id` entra no item, e
-- antes de fundir verifica-se se aquele run já lá está. Tudo o resto —
-- urgentes não agrupam, sem destinatário não agrupa, chave de entidade não
-- agrupa, a janela do dia, o advisory lock — fica igual.
create or replace function public.fn_notificacoes_agrupar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id   uuid;
  v_item jsonb;
begin
  v_item := jsonb_strip_nulls(jsonb_build_object(
    'link', new.link,
    'viatura_id', new.viatura_id,
    'candidatura_id', new.candidatura_id,
    'evento_id', new.evento_id,
    'rule_run_id', new.rule_run_id,
    'mensagem', new.mensagem,
    'em', coalesce(new.created_at, now())
  ));

  -- Regra 1 (inalterada): urgentes nunca agrupam.
  if new.severidade = 'urgente' then
    new.itens := jsonb_build_array(v_item);
    return new;
  end if;

  -- Regra 2 (inalterada): sem destinatário individual não há grupo — é uma
  -- colisão entre pessoas diferentes que vêem a mesma linha por cargo.
  if new.destinatario_id is null then
    new.itens := jsonb_build_array(v_item);
    return new;
  end if;

  -- Regra 3 (inalterada): uma linha procurável por chave de entidade nunca agrupa.
  if new.candidatura_id is not null or new.evento_id is not null then
    new.itens := jsonb_build_array(v_item);
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    coalesce(new.org_id::text, '') || '|' ||
    new.destinatario_id::text || '|' ||
    new.tipo || '|' ||
    (coalesce(new.created_at, now()))::date::text, 0));

  select id into v_id
  from public.notificacoes
  where org_id is not distinct from new.org_id
    and destinatario_id = new.destinatario_id
    and tipo = new.tipo
    and resolvida = false
    and severidade <> 'urgente'
    -- Simétrico da Regra 3: nunca fundir PARA DENTRO de uma linha com chave de
    -- entidade (ex.: as 6 linhas infladas que já existem).
    and candidatura_id is null
    and evento_id is null
    and created_at >= date_trunc('day', coalesce(new.created_at, now()))
    and created_at <  date_trunc('day', coalesce(new.created_at, now())) + interval '1 day'
  order by created_at, id
  limit 1;

  if v_id is null then
    new.itens := jsonb_build_array(v_item);
    return new;
  end if;

  -- ÚNICA REGRA NOVA — idempotência do agrupamento.
  -- Se este run já contribuiu para esta linha, o retry é um no-op: não
  -- incrementa `agrupadas` nem repete o item. Runs DIFERENTES continuam a
  -- poder contribuir para o mesmo agrupamento, que é o comportamento
  -- desejado — mesmo agrupamento não é o mesmo efeito.
  if new.rule_run_id is not null and exists (
    select 1 from public.notificacoes n
    where n.id = v_id
      and n.itens @> jsonb_build_array(jsonb_build_object('rule_run_id', new.rule_run_id))
  ) then
    return null;
  end if;

  update public.notificacoes
  set agrupadas = agrupadas + 1,
      itens = coalesce(itens, '[]'::jsonb) || v_item
  where id = v_id;

  return null;
end;
$function$;

-- ── 4. Cirurgia no executor ─────────────────────────────────────────────────
--
-- `execute_automation_runs` tem 11 910 caracteres e a migração 20260826142309
-- avisa, com razão, que cada reescrita copia o corpo inteiro e já perdeu
-- comportamento por isso ('recibo_anulado', 'cobranca_tvde_zero', o link em
-- notifications, o cap diário de emails).
--
-- Por isso NÃO se reescreve. Lê-se o corpo vivo, aplicam-se SEIS substituições
-- exactas, e cada uma tem de casar — se alguma não casar, a migração falha e
-- não deixa a função meio alterada. É a diferença entre "mudei só isto" e
-- "acho que mudei só isto".
--
-- As seis: dois inserts por tabela (o ramo do motorista e o laço geral de
-- destinatários), em notifications, notificacoes e notification_queue.
do $$
declare
  v_src      text;
  v_novo     text;
  v_antes    text;
  v_aplicadas int := 0;

  -- Cada par é (procurar, substituir). A indentação faz parte da chave: os
  -- dois ramos do executor têm níveis diferentes, e é isso que os distingue.
  v_pares text[][] := array[
    -- notifications, ramo do motorista
    array[
      E')\n          returning id into v_notification_id;',
      E')\n          on conflict (rule_run_id, destinatario_user_id) where rule_run_id is not null\n          do update set rule_run_id = notifications.rule_run_id\n          returning id into v_notification_id;'
    ],
    -- notifications, laço geral
    array[
      E')\n        returning id into v_notification_id;',
      E')\n        on conflict (rule_run_id, destinatario_user_id) where rule_run_id is not null\n        do update set rule_run_id = notifications.rule_run_id\n        returning id into v_notification_id;'
    ],
    -- notificacoes, colunas (aparece nos dois ramos)
    array[
      'insert into public.notificacoes (org_id, tipo, titulo, mensagem, severidade, destinatario_id, link, viatura_id)',
      'insert into public.notificacoes (org_id, tipo, titulo, mensagem, severidade, destinatario_id, link, viatura_id, rule_run_id)'
    ],
    -- notificacoes, valores do ramo do motorista
    array[
      E'              v_viatura_id\n            );',
      E'              v_viatura_id,\n              v_run.id\n            )\n            on conflict (rule_run_id, destinatario_id) where rule_run_id is not null do nothing;'
    ],
    -- notificacoes, valores do laço geral
    array[
      E'            v_viatura_id\n          );',
      E'            v_viatura_id,\n            v_run.id\n          )\n          on conflict (rule_run_id, destinatario_id) where rule_run_id is not null do nothing;'
    ],
    -- notification_queue, os dois ramos de uma vez (a linha de valores difere
    -- só na variável do email, por isso a chave é o fim comum)
    array[
      E'v_rule.acao_config->>''template_codigo'', v_run.payload);',
      E'v_rule.acao_config->>''template_codigo'', v_run.payload)\n          on conflict (notification_id, canal, destinatario) do nothing;'
    ]
  ];
  i int;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname = 'execute_automation_runs';

  if v_src is null then
    raise exception 'execute_automation_runs não existe — a cadeia de migrações está fora de ordem';
  end if;

  v_novo := v_src;

  for i in 1 .. array_length(v_pares, 1) loop
    v_antes := v_novo;
    v_novo := replace(v_novo, v_pares[i][1], v_pares[i][2]);

    if v_novo = v_antes then
      raise exception
        'Cirurgia %/% não casou. O corpo de execute_automation_runs mudou desde 2026-08-28 e este ficheiro está desactualizado.', i, array_length(v_pares, 1)
        using hint = 'Comparar os fragmentos com pg_get_functiondef antes de reaplicar. Nada foi alterado.';
    end if;
    v_aplicadas := v_aplicadas + 1;
  end loop;

  -- Rede final: se alguma coisa correu mal, o corpo novo não tem os seis
  -- `on conflict` que devia ter.
  if (length(v_novo) - length(replace(v_novo, 'on conflict', ''))) / length('on conflict') < 6 then
    raise exception 'Corpo resultante com menos de 6 cláusulas on conflict — a cirurgia está incompleta.';
  end if;

  execute v_novo;
  raise notice 'execute_automation_runs: % substituições aplicadas', v_aplicadas;
end $$;

-- Os grants não sobrevivem a um `create or replace` feito por outro dono, e o
-- corpo acima é reexecutado tal e qual — repõem-se por segurança.
revoke all on function public.execute_automation_runs(integer) from public, anon, authenticated;
grant execute on function public.execute_automation_runs(integer) to service_role;

-- ── 5. O emitter que duplica dentro da própria instrução ────────────────────
--
-- Encontrado na varredura de `select ... where not exists` seguido de
-- `insert`. Os oito emitters usam a mesma forma; sete estão bem, porque o
-- `select` devolve no máximo uma linha por entidade.
--
-- `emit_reservas_sem_checkin_events` faz `join calendario_eventos`. Um
-- contrato com DOIS eventos por realizar — uma recolha e uma devolução, que é
-- a combinação normal — produz DUAS linhas para o mesmo `cr.id`, e o
-- `not exists` não as vê uma à outra: é avaliado contra a tabela como estava
-- antes da instrução. Uma instrução, dois eventos idênticos.
--
-- PROVA: 36 grupos duplicados em 17 313 eventos, todos
-- `contrato_renting.sem_checkin`, todos `emitted_by = 'cron'`, todos com
-- intervalo de 00:00:00 — a mesma instrução, não dois ciclos sobrepostos.
-- Nenhum por processar, portanto não há nada a limpar.
--
-- Porque não se vê nas notificações ainda: o segundo run colide com
-- `idx_automation_runs_one_active_per_rule_entity` e é engolido. Mas esse
-- índice é PARCIAL (`pending`/`running`): se os dois eventos caírem em lotes
-- diferentes e o primeiro run já tiver concluído, o segundo nasce e notifica.
-- Com outro `rule_run_id`, portanto os índices da secção 2 não o apanham — a
-- idempotência desta migração é por EXECUÇÃO, e aqui são mesmo duas.
--
-- A CORREÇÃO: o `join` só filtra, nunca traz colunas. Passa a `exists`, que
-- exprime a mesma condição sem multiplicar linhas.
create or replace function public.emit_reservas_sem_checkin_events()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.domain_events (org_id, event_type, entity_table, entity_id, payload, emitted_by)
  select
    cr.org_id,
    'contrato_renting.sem_checkin',
    'contratos_renting',
    cr.id,
    jsonb_build_object(
      'codigo', cr.codigo,
      'matricula', cr.matricula,
      'cliente_nome', (select nome from public.clientes where id = cr.cliente_id),
      'data_fim', cr.data_fim
    ),
    'cron'
  from public.contratos_renting cr
  where cr.data_fim is not null
    and cr.data_fim <= now()
    and cr.estado_operacional = 'em_curso'
    and cr.org_id is not null
    -- Era um `join`. A condição é a mesma; deixa de multiplicar a linha.
    and exists (
      select 1 from public.calendario_eventos ce
      where ce.origem_tipo = 'contrato_renting'
        and ce.origem_id = cr.id
        and ce.tipo in ('recolha', 'devolucao', 'troca')
        and ce.realizado_em is null
    )
    and not exists (
      select 1 from public.domain_events e
      where e.entity_table = 'contratos_renting'
        and e.entity_id = cr.id
        and e.event_type = 'contrato_renting.sem_checkin'
        and e.processed_at is null
    );
end;
$function$;

revoke all on function public.emit_reservas_sem_checkin_events() from public, anon, authenticated;
grant execute on function public.emit_reservas_sem_checkin_events() to service_role;
