-- ============================================================================
-- Fase 3 — Definição congelada: um run executa a regra com que nasceu
-- ============================================================================
--
-- O PROBLEMA
--
--   evento → regra casa → run criado → passa tempo → alguém edita a regra
--   → worker reclama o run → o executor lê `automation_rules` AGORA
--   → executa a definição NOVA
--
-- Concreto: uma regra com destinatário «cargo Frota» gera um run às 09:00; às
-- 09:03 o administrador troca para «cargo Direcção»; às 09:05 o cron executa e
-- o email vai para a Direcção. Ninguém pediu isso, e não fica registo.
--
-- ── QUE CAMPOS SÃO A DEFINIÇÃO EXECUTÁVEL ───────────────────────────────────
--
-- Contado no corpo vivo, não presumido:
--
--   execute_automation_runs   acao_config (14), nome (4, fallback do titulo),
--                             acao_tipo (1, porta da execução), event_type (1)
--   process_domain_events     condicoes, cooldown_minutos, ativo, org_id,
--                             event_type — só no casamento
--
-- Fora, por terem ZERO leituras no motor: codigo, descricao, criado_por,
-- created_at e `prioridade` (o run tem a sua própria `priority`).
--
-- `condicoes` e `cooldown_minutos` entram na mesma, para auditoria — sem eles
-- não se responde «que condições foram avaliadas para nascer este run». Não
-- são lidos por ninguém em execução.
--
-- ── SNAPSHOT JSONB NO RUN, NÃO TABELA DE VERSÕES ────────────────────────────
--
--   1. O RETRY SAI DE GRAÇA. `automation_runs_fail` e `retry_failed_job`
--      devolvem a MESMA linha a `pending`. Com a definição na linha, o retry
--      mantém-na por construção; com um ponteiro, seria por vigilância.
--
--   2. A→B É ADITIVO, B→A É IMPOSSÍVEL. O `definition_hash` agrupa runs pela
--      mesma definição, portanto `automation_rule_versions` deriva-se um dia
--      de um `group by`. Ao contrário obrigava a inventar versões para 7 782
--      runs históricos.
--
--   3. Produção tem 7 778 `completed`, 4 `failed` e zero activos — não há um
--      único run a precisar de snapshot fabricado.
--
--   4. Uma tabela nova traz RLS própria, caminho de publicação no editor e
--      decisão sobre rascunho/publicado — tudo fora do âmbito desta fase.
--
-- ── FORMATO ─────────────────────────────────────────────────────────────────
--
--   { "schema_version": 1, "materializado_em": ..., "definition_hash": ...,
--     "regra": { id, org_id, nome, event_type, acao_tipo, acao_config,
--                condicoes, cooldown_minutos, ativo } }
--
-- As chaves de `regra` são os nomes das colunas de `automation_rules`. Não é
-- cosmética: é o que permite ao executor fazer `jsonb_populate_record` e
-- manter as suas 20 leituras `v_rule.*` intactas, em vez de reescrever 277
-- linhas.
--
-- O hash cobre só `regra`, não o carimbo, portanto dois runs da mesma versão
-- partilham-no. A canonicalização é a do próprio `jsonb`, que ordena chaves.
-- Não entra nada do editor — posição, zoom, selecção. O canvas não é a fonte
-- da verdade do executor.
-- ============================================================================

-- ── 1. A coluna ─────────────────────────────────────────────────────────────
-- Nullable de propósito. Os 7 782 runs históricos ficam a NULL: a definição
-- com que correram não é conhecível, e preenchê-la com a regra de hoje seria
-- inventar histórico.
alter table public.automation_runs
  add column if not exists rule_snapshot jsonb;

comment on column public.automation_runs.rule_snapshot is
  'Definição executável da regra, congelada no instante em que o run nasceu. NULL apenas para runs anteriores à Fase 3. O executor recusa-se a correr um run sem ela.';

-- ── 2. A forma canónica, num sítio só ───────────────────────────────────────
-- Existe como função para que o casamento, o retry manual e a migração de
-- dados produzam todos exactamente o mesmo formato. Duplicar esta lista por
-- três sítios era garantir que um deles ficava para trás.
create or replace function public.automation_rule_snapshot(p_regra public.automation_rules)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'schema_version',   1,
    'materializado_em', now(),
    'definition_hash',  md5(d.definicao::text),
    'regra',            d.definicao
  )
  from (
    select jsonb_build_object(
      'id',               p_regra.id,
      'org_id',           p_regra.org_id,
      'nome',             p_regra.nome,
      'event_type',       p_regra.event_type,
      'acao_tipo',        p_regra.acao_tipo,
      'acao_config',      p_regra.acao_config,
      'condicoes',        p_regra.condicoes,
      'cooldown_minutos', p_regra.cooldown_minutos,
      'ativo',            p_regra.ativo
    ) as definicao
  ) d;
$$;

comment on function public.automation_rule_snapshot(public.automation_rules) is
  'Definição executável canónica de uma regra, com hash determinístico. Só os campos que o motor lê: codigo, descricao, prioridade e criado_por ficam de fora por não terem efeito na execução.';

-- Só o service_role. Os três chamadores — o casamento, o trigger e o
-- reagendamento manual — são todos SECURITY DEFINER e correm como o dono.
revoke all on function public.automation_rule_snapshot(public.automation_rules) from public, anon, authenticated;
grant execute on function public.automation_rule_snapshot(public.automation_rules) to service_role;

-- ── 3. O invariante, no banco ───────────────────────────────────────────────
-- Isolamento multi-org é a invariante mais cara de perder deste sistema, e as
-- funções SECURITY DEFINER contornam RLS. Por isso a ligação entre o run e a
-- organização da sua definição é verificada por CHECK, não por confiança no
-- plpgsql: uma definição de outra org não chega sequer a ser gravada.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.automation_runs'::regclass
      and conname = 'automation_runs_snapshot_coerente'
  ) then
    alter table public.automation_runs
      add constraint automation_runs_snapshot_coerente
      check (
        rule_snapshot is null
        or (
          rule_snapshot ? 'schema_version'
          and rule_snapshot ? 'definition_hash'
          and rule_snapshot ? 'regra'
          and (rule_snapshot->'regra'->>'org_id')::uuid = org_id
        )
      );
  end if;
end $$;

-- ── 3b. Duas garantias diferentes, não a mesma duas vezes ───────────────────
--
-- Há dois sítios a escrever `rule_snapshot`, e vale a pena dizer porquê, senão
-- parece redundância:
--
--   O CASAMENTO congela usando o registo EXACTO que casou, no mesmo INSERT.
--   Isso fecha uma janela que mais nada fecha: em READ COMMITTED cada
--   instrução tem o seu snapshot, portanto uma releitura da regra — mesmo
--   milissegundos depois — pode já ver uma edição commitada entretanto. Seria
--   casar na v1 e executar a v2, que é precisamente o que esta fase existe
--   para impedir.
--
--   ESTE TRIGGER garante outra coisa: que não existe run sem definição, venha
--   ele de onde vier. Só actua quando `rule_snapshot` vem a NULL, por isso
--   nunca sobrepõe o que o casamento congelou.
--
-- Sem o trigger, um caminho futuro que crie um run sem snapshot produz um run
-- que o executor recusa — em voz alta, mas recusa. Sem a chamada explícita,
-- perde-se a exactidão. Tirar qualquer um deles perde alguma coisa.
--
-- Se a regra for de outra organização, o `where` não encontra nada, o snapshot
-- fica a NULL e o executor recusa o run. Falha fechada, não aberta.
create or replace function public.fn_automation_runs_congelar_definicao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.rule_snapshot is null and new.rule_id is not null then
    select public.automation_rule_snapshot(ar)
      into new.rule_snapshot
    from public.automation_rules ar
    where ar.id = new.rule_id
      and ar.org_id = new.org_id;
  end if;
  return new;
end;
$function$;

-- `create function` dá EXECUTE a PUBLIC por omissão, e esta é SECURITY
-- DEFINER. Sem esta revogação nascia mais uma função executável pelo papel
-- anónimo — exactamente o que `rls_anon_exposure.test.sql` existe para
-- apanhar. O trigger continua a correr: a execução por trigger não consulta o
-- EXECUTE de quem fez o INSERT.
revoke all on function public.fn_automation_runs_congelar_definicao() from public, anon, authenticated;

drop trigger if exists trg_automation_runs_congelar_definicao on public.automation_runs;

create trigger trg_automation_runs_congelar_definicao
  before insert on public.automation_runs
  for each row execute function public.fn_automation_runs_congelar_definicao();

-- ── 4. Runs que ainda não correram ──────────────────────────────────────────
--
-- Um run por executar ainda não tem definição própria: hoje ele leria a regra
-- viva no momento da execução. Congelar agora a regra actual é, para ele,
-- exactamente o que teria acontecido — e daqui para a frente deixa de mudar.
-- É a única classe de runs para a qual se pode afirmar isto com verdade.
--
-- Os terminais (`completed`, `failed`) ficam a NULL. A definição com que
-- correram não é recuperável e não se finge que é.
--
-- À data de escrita esta instrução afecta ZERO linhas em produção (7 778
-- completed + 4 failed, nenhum pendente). Existe para o caso de a migração
-- chegar a uma base com trabalho em curso — e para uma base reconstruída de
-- raiz, onde também não faz nada.
update public.automation_runs r
   set rule_snapshot = public.automation_rule_snapshot(ar)
  from public.automation_rules ar
 where ar.id = r.rule_id
   and ar.org_id = r.org_id
   and r.status not in ('completed', 'failed')
   and r.rule_snapshot is null;

-- ── 5. Apagar uma regra não pode apagar o que ela fez ───────────────────────
--
-- `automation_runs_rule_id_fkey` era `on delete cascade`. Apagar uma regra
-- levava consigo TODOS os runs que ela produziu — o histórico de execução
-- inteiro, em silêncio. `automation_logs` já usava `on delete set null`; as
-- duas tabelas discordavam sobre a mesma pergunta.
--
-- Com o snapshot completo no run, um run cuja regra foi apagada continua
-- legível, auditável e executável: a definição está nele. `set null` alinha-se
-- com o precedente que a própria base já tinha.
--
-- `restrict` foi considerado e rejeitado: os runs nunca são purgados, portanto
-- seria «nunca mais se pode apagar uma regra» — uma armadilha operacional.
alter table public.automation_runs alter column rule_id drop not null;

alter table public.automation_runs drop constraint if exists automation_runs_rule_id_fkey;

alter table public.automation_runs
  add constraint automation_runs_rule_id_fkey
  foreign key (rule_id) references public.automation_rules(id) on delete set null;

comment on column public.automation_runs.rule_id is
  'Regra de origem, para navegação e estatística. NULL se a regra foi apagada — o significado do run vive em rule_snapshot, não aqui.';

-- ── 6. O casamento passa a congelar ─────────────────────────────────────────
--
-- Duas substituições em `process_domain_events`. A primeira dá tipo ao ciclo
-- (de `record` para a linha de `automation_rules`), o que é o que permite
-- passar `v_rule` à função do snapshot sem coerção. A segunda acrescenta o
-- snapshot ao insert do run.
--
-- O snapshot é construído a partir do MESMO `v_rule` que acabou de casar, no
-- mesmo insert e na mesma transacção. Não há janela entre «esta regra casou» e
-- «esta é a definição do run»: são a mesma operação.
do $$
declare
  v_src   text;
  v_novo  text;
  v_antes text;
  v_pares text[][] := array[
    array[
      E'  v_rule         record;',
      E'  v_rule         public.automation_rules;'
    ],
    array[
      E'          insert into public.automation_runs (rule_id, org_id, trigger_event_id, entity_table, entity_id, payload)\n          values (v_rule.id, v_rule.org_id, v_event.id, v_event.entity_table, v_event.entity_id, v_event.payload);',
      E'          insert into public.automation_runs (rule_id, org_id, trigger_event_id, entity_table, entity_id, payload, rule_snapshot)\n          values (v_rule.id, v_rule.org_id, v_event.id, v_event.entity_table, v_event.entity_id, v_event.payload,\n                  public.automation_rule_snapshot(v_rule));'
    ]
  ];
  i int;
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname = 'process_domain_events';

  if v_src is null then
    raise exception 'process_domain_events não existe — a cadeia de migrações está fora de ordem';
  end if;

  v_novo := v_src;

  for i in 1 .. array_length(v_pares, 1) loop
    v_antes := v_novo;
    v_novo := replace(v_novo, v_pares[i][1], v_pares[i][2]);
    if v_novo = v_antes then
      raise exception
        'Cirurgia %/% em process_domain_events não casou — o corpo mudou desde a Fase 1.', i, array_length(v_pares, 1)
        using hint = 'Comparar com pg_get_functiondef antes de reaplicar. Nada foi alterado.';
    end if;
  end loop;

  if v_novo not like '%automation_rule_snapshot(v_rule)%' then
    raise exception 'process_domain_events ficou sem a chamada ao snapshot — cirurgia incompleta.';
  end if;

  execute v_novo;
end $$;

revoke all on function public.process_domain_events(integer) from public, anon, authenticated;
grant execute on function public.process_domain_events(integer) to service_role;

-- ── 7. O executor deixa de ler a regra viva ─────────────────────────────────
--
-- A substituição que define a fase. O bloco antigo era a ÚNICA leitura de
-- `automation_rules` no executor, e era ela que fazia o run mudar de
-- significado:
--
--     select * into v_rule from public.automation_rules
--      where id = v_run.rule_id and org_id = v_run.org_id;
--
-- Passa a `jsonb_populate_record` sobre o snapshot. Como `v_rule` já está
-- declarado `public.automation_rules` e as chaves do snapshot são os nomes das
-- colunas, encher o registo mantém as 20 leituras `v_rule.*` a jusante
-- intactas — uma substituição em vez de vinte, numa função que a migração
-- 20260826142309 já documentou ser perigosa de mexer.
--
-- O guarda de organização não desaparece: sai do `where` e passa a asserção
-- sobre a definição congelada.
--
-- Um run sem snapshot é recusado em voz alta em vez de cair para a regra viva
-- — cair seria reintroduzir o problema, e em silêncio.
do $$
declare
  v_src  text;
  v_novo text;
  v_proc constant text := E'      select * into v_rule\n      from public.automation_rules\n      where id = v_run.rule_id\n        and org_id = v_run.org_id;\n\n      if not found then\n        perform public.automation_runs_fail(\n          v_run.id,\n          ''Regra inexistente ou de outra organização''\n        );\n        continue;\n      end if;';
  v_sub  constant text := E'      -- Fase 3: a definição vem do run, não da tabela viva.\n      if v_run.rule_snapshot is null then\n        perform public.automation_runs_fail(\n          v_run.id,\n          ''Run sem definição congelada (anterior à Fase 3). Reagendar adopta a definição actual.''\n        );\n        continue;\n      end if;\n\n      v_rule := jsonb_populate_record(null::public.automation_rules, v_run.rule_snapshot->''regra'');\n\n      -- O guarda de organização que estava no WHERE, agora sobre o snapshot.\n      if v_rule.org_id is distinct from v_run.org_id then\n        perform public.automation_runs_fail(\n          v_run.id,\n          ''Definição congelada de outra organização''\n        );\n        continue;\n      end if;';
begin
  select pg_get_functiondef(p.oid) into v_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname = 'execute_automation_runs';

  if v_src is null then
    raise exception 'execute_automation_runs não existe — a cadeia de migrações está fora de ordem';
  end if;

  v_novo := replace(v_src, v_proc, v_sub);

  if v_novo = v_src then
    raise exception
      'Cirurgia em execute_automation_runs não casou — o bloco de leitura da regra mudou.'
      using hint = 'Comparar com pg_get_functiondef antes de reaplicar. Nada foi alterado.';
  end if;

  -- Pós-condição que dá nome à fase: nenhuma LEITURA de automation_rules sobra
  -- no executor. As duas ocorrências que ficam são a declaração de `v_rule` e
  -- o `null::public.automation_rules` do jsonb_populate_record — tipos, não
  -- consultas. Por isso o teste é sobre `from` e `join`, não sobre o nome.
  if v_novo like '%from public.automation_rules%'
     or v_novo like '%join public.automation_rules%' then
    raise exception 'Sobrou uma consulta a automation_rules no executor — a fase não está completa.';
  end if;

  if v_novo not like '%jsonb_populate_record%' then
    raise exception 'O executor ficou sem jsonb_populate_record — cirurgia incompleta.';
  end if;

  execute v_novo;
end $$;

revoke all on function public.execute_automation_runs(integer) from public, anon, authenticated;
grant execute on function public.execute_automation_runs(integer) to service_role;

-- ── 8. Reagendar um run terminal adopta a definição actual, e diz que o fez ──
--
-- `retry_failed_job` devolve a MESMA linha de `automation_runs` a `pending` —
-- não cria um run novo. Para os runs criados depois desta migração isso é
-- perfeito: o snapshot já lá está e o retry não lhe toca.
--
-- Há porém seis `failed_jobs` por resolver em produção, todos de runs
-- terminais anteriores a esta fase, portanto sem snapshot. Sem o que se segue,
-- carregar em «reagendar» produzia um run pendente que o executor recusaria —
-- seis itens da dead-letter tornados irrecuperáveis por esta migração.
--
-- A saída honesta não é fabricar a definição original: é assumir a actual e
-- deixá-lo escrito. `origem` fica no snapshot para quem auditar perceber que
-- aquela definição foi adoptada num reagendamento manual e não herdada do
-- nascimento do run.
--
-- Se a regra entretanto foi apagada, `rule_id` é NULL, não há nada a adoptar e
-- o snapshot fica NULL: o executor recusa o run com mensagem explícita, que é
-- melhor do que executá-lo com uma definição inventada.
create or replace function public.retry_failed_job(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_job public.failed_jobs;
begin
  if not (public.is_current_user_admin() or public.can_edit(auth.uid(), 'automacoes')) then
    raise exception 'sem permissão para reagendar jobs falhados';
  end if;

  select * into v_job from public.failed_jobs where id = p_id for update;

  if v_job.id is null then
    raise exception 'failed_job % não encontrado', p_id;
  end if;

  if v_job.org_id is not null and v_job.org_id <> public.get_current_org_id() then
    raise exception 'sem permissão para reagendar jobs falhados de outra organização';
  end if;

  if v_job.source_table = 'automation_runs' then
    update public.automation_runs r
    set status = 'pending', attempt = 0, next_attempt_at = now(), error_message = null,
        -- `coalesce`: um run que já tem definição congelada mantém a sua. É o
        -- ponto inteiro da fase — reagendar não é reinterpretar.
        rule_snapshot = coalesce(
          r.rule_snapshot,
          (select public.automation_rule_snapshot(ar)
                  || jsonb_build_object('origem', 'reagendamento_manual_sem_snapshot_original')
             from public.automation_rules ar
            where ar.id = r.rule_id
              and ar.org_id = r.org_id)
        )
    where r.id = v_job.source_id;
  elsif v_job.source_table = 'notification_queue' then
    update public.notification_queue
    set status = 'pending', attempt = 0, next_attempt_at = now(), error_message = null
    where id = v_job.source_id;
  else
    raise exception 'source_table % desconhecido', v_job.source_table;
  end if;

  update public.failed_jobs
  set resolved = true, resolved_by = auth.uid(), resolved_at = now(), resolution_note = 'reagendado manualmente'
  where id = p_id;
end;
$function$;

-- ── 9. Os dois leitores da regra viva em tempo de EFEITO ────────────────────
--
-- Mais duas funções decidem o destino de um run já criado lendo a regra VIVA.
-- Não estão no executor, e por isso não apareciam na descrição do problema:
--
--   fn_notifications_so_quando_ha_email  trigger BEFORE INSERT que CANCELA a
--     notificação quando a regra tem `enviar_email = false`. Desligar o email
--     apagava notificações de runs nascidos com ele ligado.
--   enviar_digests_diarios               junta notificações → run → regra viva
--     para saber se vão a digest.
--
-- Ambas passam a preferir o snapshot e ambas MANTÊM o recurso à regra viva
-- quando não há: há 65 075 notificações de runs terminais com
-- `digest_enviado_em is null`, todas sem snapshot possível. Tirar-lhes esse
-- recurso mudava o comportamento de 65 mil linhas para responder a um problema
-- que elas não têm — já correram.
create or replace function public.fn_notifications_so_quando_ha_email()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_config jsonb;
begin
  -- Alertas técnicos directos (job falhou, limite de email atingido, ticket ->
  -- gestor do contrato) não passam pelo motor de regras e criam sempre linha
  -- na fila. Nunca cancelar.
  if new.rule_run_id is null then
    return new;
  end if;

  -- Snapshot primeiro; regra viva só como recurso para runs pré-Fase 3.
  select coalesce(r.rule_snapshot->'regra'->'acao_config', ar.acao_config)
    into v_config
  from public.automation_runs r
  left join public.automation_rules ar on ar.id = r.rule_id
  where r.id = new.rule_run_id;

  -- Run que já não existe, ou regra apagada sem definição congelada:
  -- preservar. Na dúvida, guardar — o custo de uma linha a mais é nulo ao pé
  -- do de perder o pai de um email.
  if v_config is null then
    return new;
  end if;

  -- `enviar_email = true` cobre também o modo digest: o digest exige
  -- enviar_email true, e a sua linha na fila só nasce mais tarde, em
  -- enviar_digests_diarios(). Cancelar por "não tem fila agora" partiria-o.
  if coalesce((v_config->>'enviar_email')::boolean, false) then
    return new;
  end if;

  return null;
end;
$function$;

create or replace function public.enviar_digests_diarios()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      string_agg(n.titulo || coalesce(': ' || n.mensagem, ''), '<br>' order by n.created_at) as lista_html
    from public.notifications n
    join public.automation_runs r on r.id = n.rule_run_id
    -- `left join` desde a Fase 3: um run cuja regra foi apagada continua a ter
    -- definição própria e não deve desaparecer do digest por causa disso.
    left join public.automation_rules ar on ar.id = r.rule_id
    join auth.users u on u.id = n.destinatario_user_id
    where n.digest_enviado_em is null
      and coalesce(
            (r.rule_snapshot->'regra'->'acao_config'->>'enviar_email_digest')::boolean,
            (ar.acao_config->>'enviar_email_digest')::boolean,
            false) = true
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
$function$;

