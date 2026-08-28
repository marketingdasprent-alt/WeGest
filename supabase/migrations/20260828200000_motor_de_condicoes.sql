-- ============================================================================
-- Fase 4 — Motor de condições: o que o sistema não entende nunca autoriza
-- ============================================================================
--
-- O BUG
--
--     if  operador = '='  then ...
--     elsif operador = '!=' then ...
--     end if;                         -- sem ELSE
--
-- Um operador que não seja um destes dois não entra em ramo nenhum,
-- `v_matches` fica no `true` com que foi inicializado, e a condição passa
-- SEMPRE. Um filtro que parece funcionar e não filtra nada.
--
-- ── CENSO DE PRODUÇÃO, ANTES DE DECIDIR SEJA O QUE FOR ──────────────────────
--
--   95 regras, 5 organizações, todas activas, 19 event_types
--   condicoes: 95× objecto vazio `{}` — ZERO arrays, zero objectos não
--              vazios, zero nulos, zero escalares
--   automation_logs: 0 ocorrências de `condicao_nao_satisfeita` em 17 325
--
-- A segunda linha é a mais importante das duas: **nenhuma condição foi alguma
-- vez avaliada em produção**. O bug é latente, não activo, e não há um único
-- dado a migrar. Isso dá liberdade total para fixar a semântica correcta em
-- vez de a contorcer à volta de dados existentes — e obriga a usá-la bem,
-- porque não haverá segunda oportunidade tão barata.
--
-- 58 das 95 regras já foram editadas pela UI, portanto o caminho de escrita
-- funciona; só nunca ninguém lá pôs uma condição.
--
-- ── UM SÓ AVALIADOR, CONFIRMADO ─────────────────────────────────────────────
--
-- `process_domain_events` é a única função em toda a base que lê `condicoes`.
-- Do lado do frontend, `catalogo.ts` já limita o seletor a `=` e `!=` com um
-- comentário que descreve exactamente este bug. Não há semânticas paralelas a
-- reconciliar — há uma a endurecer.
--
-- ── FORMATO CANÓNICO ────────────────────────────────────────────────────────
--
--   condicoes := array de objectos, cada um com EXACTAMENTE três chaves:
--
--     { "campo": <string não vazia>, "operador": "=" | "!=", "valor": <escalar ou null> }
--
-- `valor` é jsonb, e o seu tipo JSON É o tipo. Foi considerado um campo `tipo`
-- separado, como o plano sugeria: seria redundante e, pior, poderia
-- contradizer o valor. Uma fonte de verdade só.
--
-- Chaves desconhecidas são RECUSADAS em vez de ignoradas. Se amanhã alguém
-- acrescentar `"tipo"` ou `"case_sensitive"` ao editor sem tocar no motor, a
-- escrita falha em vez de a opção ser silenciosamente deitada fora.
--
-- ── A REGRA DA COMPARABILIDADE ──────────────────────────────────────────────
--
-- Dois valores JSON são comparáveis quando têm o MESMO `jsonb_typeof`. Se não
-- forem, nenhum operador é satisfeito.
--
-- É esta regra, e não uma lista de casos especiais, que fecha o bug do campo
-- ausente que o plano marcou como obrigatório:
--
--     campo ausente  →  `payload -> campo` é NULL de SQL
--                    →  incomparável com o que quer que seja
--                    →  `=` false E `!=` false
--
-- Antes, `!=` sobre um campo inexistente dava TRUE — comparava NULL com um
-- texto e concluía «são diferentes». Uma regra escrita para «só quando o
-- estado não é rascunho» disparava em todos os eventos que nem têm estado.
--
-- Verificado no próprio Postgres, não presumido:
--
--     '10'::jsonb   = '10.0'::jsonb   → true    números comparam-se como números
--     '1.5'::jsonb  = '1.50'::jsonb   → true
--     '10'::jsonb   = '"10"'::jsonb   → false   sem coerção mágica
--     'true'::jsonb = '"true"'::jsonb → false   a string "false" não é false
--     '"A"'::jsonb  = '"a"'::jsonb    → false   strings continuam sensíveis a maiúsculas
--     'null'::jsonb = 'null'::jsonb   → true    null explícito compara com null explícito
--
-- `null` explícito e campo ausente ficam distinguíveis, como o plano exige: o
-- primeiro tem `jsonb_typeof` = 'null', o segundo não existe.
--
-- ── PORQUE SÓ `=` E `!=` ────────────────────────────────────────────────────
--
-- `>`, `>=`, `<`, `<=`, `contains`, `in`, `is_null` foram avaliados e ficam de
-- fora. Não por dificuldade — a regra da comparabilidade dá-os quase de graça —
-- mas porque:
--
--   · não existe uma única condição em produção, portanto não há necessidade
--     demonstrada de nenhum deles;
--   · o editor só sabe emitir strings e só oferece estes dois, logo os
--     numéricos seriam inalcançáveis pela UI e só existiriam para escrita
--     directa na API;
--   · `is_null` obrigava a decidir se «ausente» conta como nulo — uma decisão
--     de produto que ninguém precisou de tomar ainda.
--
-- O registry é fechado e aditivo: acrescentar um operador é uma entrada em
-- `fn_operadores_suportados()` e um ramo no `case`. A lista é explícita
-- precisamente para que crescer seja uma decisão e não um acidente.
--
-- ── FALHA FECHADA, EM DOIS SÍTIOS ───────────────────────────────────────────
--
--   ESCRITA    configuração inválida é recusada pelo trigger, com a razão.
--   RUNTIME    se mesmo assim chegar uma, a REGRA é saltada e registada; o
--              evento segue e conclui.
--
-- A segunda metade é o que impede uma regra mal configurada de se tornar um
-- poison event: `fn_avaliar_condicoes` nunca levanta excepção, devolve false.
-- Uma automação partida numa organização não pode gastar as tentativas de um
-- evento nem parar as outras regras que casam com ele.
-- ============================================================================

-- ── 1. O registry, explícito ────────────────────────────────────────────────
create or replace function public.fn_operadores_suportados()
returns text[]
language sql
immutable
as $$
  select array['=', '!=']::text[];
$$;

comment on function public.fn_operadores_suportados() is
  'Lista fechada de operadores de condição. Qualquer outro é configuração inválida — nunca um match. Acrescentar aqui obriga a acrescentar o ramo em fn_avaliar_condicao.';

-- ── 2. Validação: uma condição de cada vez ──────────────────────────────────
-- Devolve NULL quando é válida, ou a razão em texto quando não é. Texto e não
-- boolean porque a mesma resposta serve para recusar a escrita com uma
-- mensagem útil e para registar o motivo no log de execução.
create or replace function public.fn_condicao_invalida(p_condicao jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_chaves text[];
begin
  if p_condicao is null or jsonb_typeof(p_condicao) <> 'object' then
    return 'cada condição tem de ser um objecto';
  end if;

  select array_agg(k order by k) into v_chaves from jsonb_object_keys(p_condicao) k;

  if v_chaves is distinct from array['campo', 'operador', 'valor'] then
    return 'as chaves têm de ser exactamente campo, operador e valor (recebido: '
           || coalesce(array_to_string(v_chaves, ', '), 'nenhuma') || ')';
  end if;

  if jsonb_typeof(p_condicao->'campo') <> 'string'
     or btrim(p_condicao->>'campo') = '' then
    return 'campo tem de ser uma string não vazia';
  end if;

  if jsonb_typeof(p_condicao->'operador') <> 'string' then
    return 'operador tem de ser uma string';
  end if;

  if not (p_condicao->>'operador' = any (public.fn_operadores_suportados())) then
    return 'operador "' || (p_condicao->>'operador') || '" não é suportado (suportados: '
           || array_to_string(public.fn_operadores_suportados(), ', ') || ')';
  end if;

  -- Objectos e arrays ficam de fora enquanto não houver operador que saiba o
  -- que fazer com eles. Aceitá-los agora seria guardar configuração que o
  -- motor não consegue honrar.
  if jsonb_typeof(p_condicao->'valor') in ('object', 'array') then
    return 'valor tem de ser um escalar ou null, não um ' || jsonb_typeof(p_condicao->'valor');
  end if;

  return null;
end;
$$;

-- ── 3. Validação: a lista inteira ───────────────────────────────────────────
create or replace function public.fn_condicoes_invalidas(p_condicoes jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_item   jsonb;
  v_motivo text;
  i        int := 0;
begin
  if p_condicoes is null then
    return 'condicoes não pode ser nulo';
  end if;

  if jsonb_typeof(p_condicoes) <> 'array' then
    return 'condicoes tem de ser um array (recebido: ' || jsonb_typeof(p_condicoes) || ')';
  end if;

  for v_item in select * from jsonb_array_elements(p_condicoes)
  loop
    v_motivo := public.fn_condicao_invalida(v_item);
    if v_motivo is not null then
      return 'condição ' || i::text || ': ' || v_motivo;
    end if;
    i := i + 1;
  end loop;

  return null;
end;
$$;

-- ── 4. Avaliação de uma condição ────────────────────────────────────────────
-- NUNCA levanta excepção. É esta propriedade que impede uma regra partida de
-- se tornar um poison event.
create or replace function public.fn_avaliar_condicao(p_condicao jsonb, p_payload jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  v_esperado jsonb;
  v_real     jsonb;
begin
  -- Falha fechada: o que não é compreendido não autoriza.
  if public.fn_condicao_invalida(p_condicao) is not null then
    return false;
  end if;

  v_esperado := p_condicao->'valor';
  v_real     := p_payload -> btrim(p_condicao->>'campo');

  -- Campo ausente. NULL de SQL, não `null` de JSON: são coisas diferentes e
  -- ficam diferentes. Um campo que não existe não satisfaz operador nenhum,
  -- nem sequer `!=`.
  if v_real is null then
    return false;
  end if;

  -- Comparabilidade. Sem isto, a ordenação interna do jsonb compararia tipos
  -- diferentes em silêncio e devolveria uma resposta sem significado.
  if jsonb_typeof(v_real) is distinct from jsonb_typeof(v_esperado) then
    return false;
  end if;

  case p_condicao->>'operador'
    when '='  then return v_real =  v_esperado;
    when '!=' then return v_real <> v_esperado;
    -- Inalcançável: a validação acima já recusou. Existe na mesma, porque um
    -- operador acrescentado ao registry e esquecido aqui tem de falhar
    -- fechado, não passar.
    else return false;
  end case;
end;
$$;

-- ── 5. Avaliação da lista — conjunção ───────────────────────────────────────
-- Todas verdadeiras. Sem OR, sem grupos, sem aninhamento: isso pertence ao
-- Workflow Engine e não a esta fase.
create or replace function public.fn_avaliar_condicoes(p_condicoes jsonb, p_payload jsonb)
returns boolean
language plpgsql
immutable
as $$
begin
  -- Lista vazia é «sem condições» e casa. NULL é «desconhecido» e não casa —
  -- a coluna é NOT NULL com default `[]`, portanto isto só é alcançável por
  -- chamada directa, e aí a resposta certa é falhar fechado.
  if p_condicoes is null or jsonb_typeof(p_condicoes) <> 'array' then
    return false;
  end if;

  if jsonb_array_length(p_condicoes) = 0 then
    return true;
  end if;

  return not exists (
    select 1
    from jsonb_array_elements(p_condicoes) c
    where not public.fn_avaliar_condicao(c.value, p_payload)
  );
end;
$$;

comment on function public.fn_avaliar_condicoes(jsonb, jsonb) is
  'Avalia as condições de uma regra contra o payload do evento. Conjunção. Nunca levanta excepção: configuração inválida devolve false, para que uma regra partida não consuma as tentativas do evento.';

-- ── 6. Normalizar a representação de "sem condições" ────────────────────────
--
-- As 95 regras têm `{}`. Que isso significa «sem condições» não é suposição:
-- é o default da coluna, o motor só alguma vez avaliou arrays, e o log
-- `condicao_nao_satisfeita` nunca disparou. Não há um único `{}` que possa
-- estar a querer dizer outra coisa.
--
-- Manter os dois formatos era manter uma ambiguidade por acidente. Passa a
-- haver uma forma vazia só, e o CHECK a seguir torna-a a única possível.
--
--   antes:  95 × '{}'      (object)
--   depois: 95 × '[]'      (array)
update public.automation_rules
   set condicoes = '[]'::jsonb
 where jsonb_typeof(condicoes) <> 'array';

alter table public.automation_rules
  alter column condicoes set default '[]'::jsonb;

-- ── 7. O invariante estrutural, no banco ────────────────────────────────────
-- A UI não é fronteira de segurança. O CHECK apanha a forma; o trigger a
-- seguir apanha o conteúdo.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.automation_rules'::regclass
      and conname = 'automation_rules_condicoes_array'
  ) then
    alter table public.automation_rules
      add constraint automation_rules_condicoes_array
      check (jsonb_typeof(condicoes) = 'array');
  end if;
end $$;

-- ── 8. Validação na escrita ─────────────────────────────────────────────────
-- Mesmo idioma de `fn_validar_acao_config`, que já guarda a outra metade da
-- configuração desta tabela: trigger, `ERRCODE = 'check_violation'`, e um
-- HINT que diz de onde veio a recusa.
create or replace function public.fn_validar_condicoes()
returns trigger
language plpgsql
as $function$
declare
  v_motivo text;
begin
  -- Uma alteração que não toca nas condições não as revalida — o mesmo
  -- atalho que o validador da acao_config já usa.
  if TG_OP = 'UPDATE' and new.condicoes is not distinct from old.condicoes then
    return new;
  end if;

  v_motivo := public.fn_condicoes_invalidas(new.condicoes);

  if v_motivo is not null then
    raise exception 'condicoes inválidas: %', v_motivo
      using ERRCODE = 'check_violation', HINT = 'Validação condicoes (automation_rules)';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_validar_condicoes on public.automation_rules;

create trigger trg_validar_condicoes
  before insert or update on public.automation_rules
  for each row execute function public.fn_validar_condicoes();

-- ── 9. O casamento passa a usar o motor ─────────────────────────────────────
--
-- Duas substituições em `process_domain_events`. A primeira troca as variáveis
-- do avaliador embutido pela que guarda o motivo da invalidez; a segunda troca
-- o avaliador inteiro por duas chamadas.
--
-- A separação entre as duas chamadas é o ponto: um operador válido que não
-- casa e uma configuração partida deixam de ser o mesmo acontecimento no log.
-- «Porque é que a regra não disparou» passa a ter duas respostas distintas —
-- `condicao_nao_satisfeita` e `condicao_invalida` — e a segunda traz o motivo.
--
-- O `continue` salta a REGRA, não o evento. As outras regras que casam com o
-- mesmo evento continuam a ser avaliadas e o evento conclui.
--
-- O detalhe do log leva o motivo e o id do evento, nunca o payload: o payload
-- transporta matrículas, nomes de clientes e NIFs.
do $$
declare
  v_src   text;
  v_novo  text;
  v_antes text;
  v_pares text[][] := array[
    array[
      E'  v_condicao     jsonb;\n  v_matches      boolean;',
      E'  v_invalidas    text;'
    ],
    array[
      E'        v_matches := true;\n\n        if jsonb_typeof(v_rule.condicoes) = ''array'' then\n          for v_condicao in select * from jsonb_array_elements(v_rule.condicoes)\n          loop\n            if v_condicao->>''operador'' = ''='' then\n              if (v_event.payload->>(v_condicao->>''campo'')) is distinct from (v_condicao->>''valor'') then\n                v_matches := false;\n              end if;\n            elsif v_condicao->>''operador'' = ''!='' then\n              if (v_event.payload->>(v_condicao->>''campo'')) is not distinct from (v_condicao->>''valor'') then\n                v_matches := false;\n              end if;\n            end if;\n          end loop;\n        end if;\n\n        if not v_matches then\n          insert into public.automation_logs (rule_id, org_id, evento, detalhe)\n          values (v_rule.id, v_rule.org_id, ''condicao_nao_satisfeita'', jsonb_build_object(''event_id'', v_event.id));\n          continue;\n        end if;',
      E'        -- Fase 4: configuração inválida salta a REGRA, não o evento.\n        v_invalidas := public.fn_condicoes_invalidas(v_rule.condicoes);\n        if v_invalidas is not null then\n          insert into public.automation_logs (rule_id, org_id, evento, detalhe)\n          values (v_rule.id, v_rule.org_id, ''condicao_invalida'',\n                  jsonb_build_object(''event_id'', v_event.id, ''motivo'', v_invalidas));\n          continue;\n        end if;\n\n        if not public.fn_avaliar_condicoes(v_rule.condicoes, v_event.payload) then\n          insert into public.automation_logs (rule_id, org_id, evento, detalhe)\n          values (v_rule.id, v_rule.org_id, ''condicao_nao_satisfeita'', jsonb_build_object(''event_id'', v_event.id));\n          continue;\n        end if;'
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
        'Cirurgia %/% em process_domain_events não casou — o avaliador mudou desde a Fase 1.', i, array_length(v_pares, 1)
        using hint = 'Comparar com pg_get_functiondef antes de reaplicar. Nada foi alterado.';
    end if;
  end loop;

  -- Pós-condição: não sobra avaliação embutida.
  if v_novo like '%v_matches%' or v_novo like '%v_condicao%' then
    raise exception 'Sobrou avaliador embutido em process_domain_events — a fase não está completa.';
  end if;

  if v_novo not like '%fn_avaliar_condicoes(v_rule.condicoes, v_event.payload)%' then
    raise exception 'process_domain_events ficou sem a chamada ao motor de condições.';
  end if;

  execute v_novo;
end $$;

revoke all on function public.process_domain_events(integer) from public, anon, authenticated;
grant execute on function public.process_domain_events(integer) to service_role;

-- ── 10. ACL ─────────────────────────────────────────────────────────────────
--
-- Nenhuma destas funções é SECURITY DEFINER: são transformações puras dos
-- argumentos, não tocam em tabela nenhuma, e por isso correm com os
-- privilégios de quem chama. `create function` dá EXECUTE a PUBLIC por
-- omissão, o que incluiria `anon` — daí a revogação explícita.
--
-- `authenticated` precisa delas: o trigger de validação é SECURITY INVOKER e
-- corre com o papel de quem grava a regra, que é o administrador autenticado
-- no editor.
revoke all on function public.fn_operadores_suportados()              from public, anon;
revoke all on function public.fn_condicao_invalida(jsonb)             from public, anon;
revoke all on function public.fn_condicoes_invalidas(jsonb)           from public, anon;
revoke all on function public.fn_avaliar_condicao(jsonb, jsonb)       from public, anon;
revoke all on function public.fn_avaliar_condicoes(jsonb, jsonb)      from public, anon;
revoke all on function public.fn_validar_condicoes()                  from public, anon, authenticated;

grant execute on function public.fn_operadores_suportados()           to authenticated, service_role;
grant execute on function public.fn_condicao_invalida(jsonb)          to authenticated, service_role;
grant execute on function public.fn_condicoes_invalidas(jsonb)        to authenticated, service_role;
grant execute on function public.fn_avaliar_condicao(jsonb, jsonb)    to authenticated, service_role;
grant execute on function public.fn_avaliar_condicoes(jsonb, jsonb)   to authenticated, service_role;
