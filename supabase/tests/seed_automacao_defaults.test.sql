-- ============================================================
-- Motor de Automação — seed_automacao_defaults() (pgTAP)
-- ============================================================
-- Corre com:  supabase start  &&  supabase test db
--
-- Cobre: a função semeia as regras por omissão numa organização, é
-- idempotente, e uma organização nova recebe-as automaticamente via trigger.
--
-- ── NOTA SOBRE O DESENHO DESTE TESTE (2026-08-28) ───────────────────────────
-- Este ficheiro afirmava que a função criava exactamente 5 regras, com uma
-- lista fixa de códigos. Nunca chegou a correr — as UUIDs mnemónicas que usava
-- não eram hexadecimais válidas, logo o ficheiro nem sequer fazia parse.
--
-- Quando finalmente correu, falhou: a função passou a semear 19 regras. Não é
-- um bug — o motor ganhou 14 tipos de evento desde que o teste foi escrito, e
-- produção confirma 19 regras com 19 códigos distintos em cada uma das 5
-- organizações.
--
-- O teste foi reescrito para verificar INVARIANTES em vez de números mágicos:
-- «não duplica», «o trigger semeia o mesmo que a chamada directa», «não há
-- códigos repetidos». Esses continuam verdadeiros quando alguém acrescentar a
-- 20.ª regra; o `5` não continuava, e foi por isso que apodreceu.
--
-- A contagem exacta fica aqui à mesma, num único sítio e com o motivo escrito:
-- serve para dar por uma regra removida sem querer. Se acrescentares uma regra
-- ao seed, actualiza REGRAS_ESPERADAS e mais nada.
-- ============================================================

begin;
select plan(6);

-- Actualizar ao acrescentar/remover uma regra em seed_automacao_defaults().
create temp table _esperado as select 19::int as regras_esperadas;

insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000a0000', 'Org Seed A', 'seed-automacao-a');

select public.seed_automacao_defaults('00000000-0000-0000-0000-0000000a0000');

-- 1. Semeia o número de regras esperado.
--
-- Escopado a acao_tipo = 'notificacao': o INSERT em organizacoes já dispara
-- trg_organizacoes_seed_automacao, que semeia E divide (migração
-- 20260901110000) — a organização nasce também com as gémeas de email.
-- Contar todas as linhas mediria o seed mais a divisão, duas coisas
-- diferentes; este teste é só sobre o seed.
select is(
  (select count(*)::int from public.automation_rules
     where org_id = '00000000-0000-0000-0000-0000000a0000' and acao_tipo = 'notificacao'),
  (select regras_esperadas from _esperado),
  'seed_automacao_defaults() cria todas as regras por omissão'
);

-- 2. Sem códigos repetidos dentro da mesma organização. É o que a constraint
--    unique (codigo, org_id) promete; aqui confirma-se que a função a respeita
--    em vez de depender de o INSERT rebentar.
select is(
  (select count(distinct codigo)::int from public.automation_rules
     where org_id = '00000000-0000-0000-0000-0000000a0000' and acao_tipo = 'notificacao'),
  (select regras_esperadas from _esperado),
  'cada regra semeada tem um código distinto'
);

-- 3. Todas nascem activas — uma regra semeada inactiva passaria despercebida
--    até alguém reparar que um aviso nunca chegou.
select is(
  (select count(*)::int from public.automation_rules
     where org_id = '00000000-0000-0000-0000-0000000a0000' and not ativo),
  0,
  'nenhuma regra é semeada desactivada'
);

-- 4. Um núcleo de regras tem de estar presente. Subconjunto e não igualdade:
--    acrescentar regras é evolução normal, perder estas seria regressão.
select is(
  (select count(*)::int
     from unnest(array[
       'viatura.seguro_expirando',
       'viatura.inspecao_expirando',
       'motorista.carta_expirando',
       'motorista.licenca_tvde_expirando',
       'cobranca.gerada'
     ]) as nucleo(codigo)
    where not exists (
      select 1 from public.automation_rules r
      where r.org_id = '00000000-0000-0000-0000-0000000a0000'
        and r.codigo = nucleo.codigo
    )),
  0,
  'as regras de expiração e de cobrança continuam a ser semeadas'
);

-- 5. Idempotência. Comparada com a contagem anterior e não com um literal:
--    é o invariante que interessa e nunca precisa de ser actualizado.
create temp table _antes as
  select count(*)::int as n from public.automation_rules
  where org_id = '00000000-0000-0000-0000-0000000a0000';

select public.seed_automacao_defaults('00000000-0000-0000-0000-0000000a0000');

select is(
  (select count(*)::int from public.automation_rules
     where org_id = '00000000-0000-0000-0000-0000000a0000'),
  (select n from _antes),
  'chamar seed_automacao_defaults() outra vez não duplica as regras'
);

-- 6. O trigger em `organizacoes` semeia o mesmo que a chamada directa.
--    Comparado entre organizações: se o seed crescer, as duas crescem juntas.
insert into public.organizacoes (id, nome, codigo) values
  ('00000000-0000-0000-0000-0000000b0000', 'Org Seed B', 'seed-automacao-b');

select is(
  (select count(*)::int from public.automation_rules
     where org_id = '00000000-0000-0000-0000-0000000b0000'),
  (select n from _antes),
  'uma organização nova recebe as mesmas regras automaticamente (trigger em organizacoes)'
);

select * from finish();
rollback;
