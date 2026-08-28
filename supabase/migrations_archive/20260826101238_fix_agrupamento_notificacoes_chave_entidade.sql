-- ============================================================
-- Agrupamento: só agrupa o que tem destinatário individual
-- ============================================================
-- O trigger fn_notificacoes_agrupar() (20260729200000) funde notificações por
-- (org_id, destinatario_id, tipo, dia). Foi desenhado para os tipos do motor de
-- automação, que endereçam uma pessoa concreta — mas foi instalado na tabela,
-- pelo que apanha TODOS os tipos, incluindo os três que endereçam por CARGO e
-- que por isso têm `destinatario_id` sempre NULL:
--
--   motorista_pendente · escalonamento · pedido_troca_kms
--
-- Em SQL, `NULL is not distinct from NULL` é verdadeiro. Resultado: todas as
-- candidaturas submetidas no mesmo dia na mesma organização colapsam numa
-- única linha, e essa linha guarda o `candidatura_id` da PRIMEIRA. A partir daí:
--
--   1. O botão "Ver candidatura" leva sempre à candidatura A, para todas.
--   2. notificar_motorista_pendente() fecha o aviso com
--      `WHERE candidatura_id = NEW.id`. Tratar a candidatura B não encontra a
--      linha (o candidatura_id dela é o de A) e o aviso fica preso — que é
--      exactamente o bug que a migração 20260608120000 existiu para corrigir.
--   3. Tratar a candidatura A resolve a linha inteira, e os avisos de B, C, D…
--      desaparecem sem nunca terem sido vistos por ninguém.
--
-- ------------------------------------------------------------
-- O SEGUNDO DEFEITO, PIOR, E ESTE ESTÁ ACTIVO
-- ------------------------------------------------------------
-- O agrupamento não perde só o `candidatura_id`: perde QUALQUER referência de
-- entidade que não seja a da primeira linha do grupo. E há código que usa
-- essas referências para se desduplicar a si próprio.
--
-- verificar_lista_espera_disponibilidade() (cron, */5 min) faz:
--
--     if exists (select 1 from notificacoes
--                 where evento_id = <esta entrada> and tipo = 'viatura_disponivel'
--                   and resolvida = false)
--     then continue;   -- já avisei sobre esta entrada, não repetir
--
-- Quando o INSERT é fundido, a linha resultante fica com o `evento_id` da
-- PRIMEIRA entrada. Para a segunda entrada, aquele `exists` deixa de encontrar
-- o que quer que seja — e volta a inserir. Cinco minutos depois, outra vez.
-- Para sempre.
--
-- MEDIDO EM PRODUÇÃO (2026-08-26): seis linhas 'viatura_disponivel' por
-- resolver, com `agrupadas` de 6, 6, 289, 297, 497 e 577. São 1672 repetições
-- do mesmo punhado de avisos ("Viatura disponível: FIAT PANDA"), não 1672
-- factos distintos. O guard anti-duplicação estava a ser derrotado pelo
-- próprio mecanismo que devia reduzir ruído.
--
-- A REGRA CERTA
-- Não é "tem destinatário": é "esta linha é procurável por alguém". Agrupar só
-- é seguro quando a linha não carrega uma chave que outro código use para a
-- encontrar. Hoje há duas dessas chaves, e ambas têm um `where <col> = X and
-- resolvida = false` algures:
--
--   candidatura_id → notificar_motorista_pendente(), ramo de fecho
--   evento_id      → verificar_lista_espera_disponibilidade(), guard
--
-- `viatura_id` NÃO é uma delas: ninguém procura notificações por viatura, e é
-- precisamente o caso que o agrupamento existe para servir (88 seguros a
-- expirar numa linha, com os 88 links preservados em `itens`). Continua a
-- agrupar.
--
-- PORQUE CONDIÇÕES ESTRUTURAIS E NÃO UMA LISTA DE TIPOS
-- Uma lista de tipos ('motorista_pendente', 'escalonamento', …) tinha de ser
-- mantida sempre que se acrescentasse um tipo — e a história desta tabela são
-- 19 reescrituras do CHECK de `tipo`, três das quais perderam um valor pelo
-- caminho. As condições abaixo não precisam de manutenção: um aviso sem
-- destinatário não é um grupo de uma pessoa (é uma colisão entre pessoas), e
-- um aviso com chave de entidade não pode perdê-la (é assim que o sistema o
-- volta a encontrar).
--
-- DADOS EXISTENTES
-- Esta migração NÃO toca nas seis linhas infladas. `agrupadas = 577` vai
-- continuar a ler-se "577" no sino até se decidir o que fazer com elas — é uma
-- decisão à parte, e apagar dados em produção não entra numa migração cujo
-- objectivo é parar a hemorragia. O que ela garante é que o número deixa de
-- crescer.
--   Para os separar depois, a lista está toda em `itens`.
--
-- Idempotente e aditiva: só substitui o corpo da função.
-- ============================================================

create or replace function public.fn_notificacoes_agrupar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id   uuid;
  v_item jsonb;
begin
  v_item := jsonb_strip_nulls(jsonb_build_object(
    'link', new.link,
    'viatura_id', new.viatura_id,
    'candidatura_id', new.candidatura_id,
    'evento_id', new.evento_id,
    'mensagem', new.mensagem,
    'em', coalesce(new.created_at, now())
  ));

  -- Regra 1 (inalterada): urgentes nunca agrupam — cada uma toca som e exige
  -- uma decisão individual; colapsá-las esconderia a segunda.
  if new.severidade = 'urgente' then
    new.itens := jsonb_build_array(v_item);
    return new;
  end if;

  -- Regra 2 (NOVA): sem destinatário individual não há grupo possível.
  -- Estes avisos são dirigidos a um CARGO — várias pessoas vêem a mesma linha,
  -- e cada linha representa uma entidade diferente (uma candidatura, um pedido
  -- de kms). Fundi-las é perder informação, não reduzir ruído.
  if new.destinatario_id is null then
    new.itens := jsonb_build_array(v_item);
    return new;
  end if;

  -- Regra 3 (NOVA): uma linha procurável por chave de entidade nunca agrupa.
  -- Fundir faz a linha resultante ficar com a chave da PRIMEIRA, e o código que
  -- procura pelas outras deixa de as encontrar. Foi assim que o guard da lista
  -- de espera passou a reinserir de 5 em 5 minutos (agrupadas = 577).
  if new.candidatura_id is not null or new.evento_id is not null then
    new.itens := jsonb_build_array(v_item);
    return new;
  end if;

  -- Dois inserts concorrentes do mesmo grupo criariam ambos a "primeira" linha
  -- (o SELECT de baixo não encontra nada em nenhum dos dois). O lock serializa
  -- por grupo — mesmo padrão de pg_try_advisory_xact_lock já usado na fila do
  -- Via Verde. Liberta no fim da transacção, sem necessidade de unlock.
  perform pg_advisory_xact_lock(hashtextextended(
    coalesce(new.org_id::text, '') || '|' ||
    new.destinatario_id::text || '|' ||
    new.tipo || '|' ||
    (coalesce(new.created_at, now()))::date::text, 0));

  -- `destinatario_id = new.destinatario_id` (igualdade simples) em vez de
  -- `is not distinct from`: chegados aqui, sabemos que não é NULL, e a
  -- igualdade deixa explícito que o ramo do NULL já não passa por aqui.
  select id into v_id
  from public.notificacoes
  where org_id is not distinct from new.org_id
    and destinatario_id = new.destinatario_id
    and tipo = new.tipo
    and resolvida = false
    and severidade <> 'urgente'
    -- Simétrico da Regra 3: nunca fundir PARA DENTRO de uma linha que carrega
    -- chave de entidade. Sem isto, uma linha antiga (criada antes desta
    -- migração, ou por um caminho que ainda a preencha) continuaria a absorver
    -- inserts novos e a mascarar-lhes a identidade.
    and candidatura_id is null
    and evento_id is null
    and created_at >= date_trunc('day', coalesce(new.created_at, now()))
    and created_at <  date_trunc('day', coalesce(new.created_at, now())) + interval '1 day'
  order by created_at, id
  limit 1;

  -- Primeira do grupo neste dia: entra como linha normal, já com o array.
  if v_id is null then
    new.itens := jsonb_build_array(v_item);
    return new;
  end if;

  -- Já existe: acrescenta ao grupo e cancela este INSERT.
  update public.notificacoes
  set agrupadas = agrupadas + 1,
      itens = coalesce(itens, '[]'::jsonb) || v_item
  where id = v_id;

  return null;
end;
$$;

comment on function public.fn_notificacoes_agrupar() is
  'Agrupa notificações in-app por (org, destinatário, tipo, dia), acumulando as entidades afectadas em `itens`. NÃO agrupa urgentes nem avisos sem destinatario_id (esses são dirigidos a um cargo e cada linha é uma entidade distinta). Devolve NULL para cancelar o INSERT quando o grupo do dia já existe.';

revoke execute on function public.fn_notificacoes_agrupar() from anon, authenticated;
