-- supabase/tests/acordos_pagamento.test.sql
begin;
select plan(43);

-- ── META: RLS e isolamento multi-tenant ────────────────────────────────
select has_table('public', 'acordos_pagamento', 'tabela acordos_pagamento existe');
select has_table('public', 'acordo_parcelas',   'tabela acordo_parcelas existe');

select is(
  (select relrowsecurity from pg_class where oid = 'public.acordos_pagamento'::regclass),
  true, 'acordos_pagamento tem RLS activa');

select is(
  (select count(*)::int from pg_policies
    where schemaname='public' and tablename='acordos_pagamento'
      and policyname='rls_org_isolation' and permissive='RESTRICTIVE'),
  1, 'acordos_pagamento tem a policy RESTRICTIVE rls_org_isolation');

select is(
  (select count(*)::int from pg_policies
    where schemaname='public' and tablename='acordo_parcelas'
      and policyname='rls_org_isolation' and permissive='RESTRICTIVE'),
  1, 'acordo_parcelas tem a policy RESTRICTIVE rls_org_isolation');

-- ── Seed próprio, dentro da transação ──────────────────────────────────
-- NÃO reutilizar linhas existentes: o teste tem de dar o mesmo resultado numa
-- base vazia e numa base cheia. O rollback no fim limpa tudo.
--
-- Colunas NOT NULL sem valor utilizável por omissão, inspecionadas nas migrations:
--   organizacoes        (20260513100001) → nome, codigo (UNIQUE)
--   clientes             (20260515000002) → nome (nif é opcional — e validado
--                          por trg_validar_nif_iban/nif_pt_valido em
--                          20260611000002; omitido de propósito no seed).
--                          org_id tornou-se NOT NULL em 20260530000000, com
--                          DEFAULT get_current_org_id() — mas essa função lê
--                          user_org_ativa via auth.uid(), que é NULL fora de
--                          uma sessão autenticada, por isso org_id TEM de ser
--                          passado explicitamente aqui.
--   viaturas             (20260123125903) → matricula (UNIQUE), marca, modelo;
--                          org_id tornou-se NOT NULL em 20260513100004, com o
--                          mesmo problema de DEFAULT que clientes — passado
--                          explicitamente. (contratos_renting.viatura_id é
--                          NOT NULL → precisa de uma viatura real). marca_id/
--                          modelo_id (20260519300007, FK opcional para
--                          viatura_marcas/viatura_modelos) são passados a par
--                          do texto: viatura_marcas exige org_id+nome e
--                          viatura_modelos exige org_id+marca_id+nome
--                          (20260519300001) — sem uma linha de catálogo válida
--                          um trigger de sincronização de marca/modelo por id
--                          (quando presente) anularia o texto e violava o
--                          NOT NULL de viaturas.marca/modelo.
--   auth.users            → id, email (padrão de rls_org_isolation.test.sql
--                          linhas 83-85). contratos_renting.created_by tem
--                          DEFAULT auth.uid(), NULL fora de sessão autenticada;
--                          o trigger AFTER INSERT de cascata (cascata_open)
--                          usa COALESCE(NEW.created_by, auth.uid()) para
--                          preencher calendario_eventos.criado_por, que é
--                          NOT NULL sem default — por isso created_by tem de
--                          vir de um utilizador real, passado explicitamente.
--   contratos_renting    (20260518000010) → cliente_id, viatura_id,
--                          data_inicio, data_fim  (org_id tem o mesmo default
--                          problemático — passado explicitamente). reserva_id
--                          tornou-se NOT NULL em 20260518000011 ("todo o
--                          contrato vem de uma reserva") → precisa de uma
--                          reserva real também.
--   reservas             (20260516000001) → org_id, data_inicio, data_fim
--                          (codigo é gerado por trigger se vier NULL/0)
--   contrato_cobrancas   (20260520000003) → org_id, contrato_id, periodo_de,
--                          periodo_ate, destinatario_id, destinatario_papel,
--                          destinatario_nome, valor_sem_iva
--
-- Sufixo aleatório evita colidir com `organizacoes.codigo` (UNIQUE) e
-- `viaturas.matricula` (UNIQUE) numa base já povoada.
--
-- O seed produz:
--   _ctx  → 1 org, 1 cliente titular, 1 cobrança 'emitida' SEM acordo
--   _ctx2 → outra cobrança 'emitida' sem acordo (mesmo titular, período
--           diferente) + um SEGUNDO cliente (outro_cliente_id), candidato a
--           assumir a dívida nos testes de cessão da Task 3
--   _ctx3 → uma TERCEIRA cobrança 'emitida' sem acordo, dedicada aos testes
--           de liquidação da Task 4 (ver secção correspondente mais abaixo:
--           por essa altura _ctx e _ctx2 já ficaram com acordos vivos/
--           cancelados que não servem de base a esses testes) + um motorista
--           (motoristas_ativos) ligado ao MESMO utilizador do seed
--           (v_user_id), para poder autenticar como o devedor
--
-- Atenção: inserir uma cobrança já em estado 'emitida' dispara
-- fn_cobranca_posta_movimento, que cria um débito em conta_movimentos. Isso é
-- esperado — a Task 3 conta apenas os movimentos de origem = 'cessao', por
-- isso não colide com este débito de origem = 'cobranca'.
do $$
declare
  v_suffix        text := replace(gen_random_uuid()::text, '-', '');
  v_org_id        uuid;
  v_marca_id      uuid;
  v_modelo_id     uuid;
  v_viatura_id    uuid;
  v_titular_id    uuid;
  v_outro_id      uuid;
  v_user_id       uuid;
  v_reserva_id    uuid;
  v_contrato_id   uuid;
  v_cobranca1_id  uuid;
  v_cobranca2_id  uuid;
  v_cobranca3_id  uuid;
  v_motorista_id  uuid;
begin
  insert into public.organizacoes (nome, codigo)
  values ('Org Acordos Teste ' || v_suffix, 'ap-test-' || v_suffix)
  returning id into v_org_id;

  insert into public.viatura_marcas (org_id, nome)
  values (v_org_id, 'Marca Teste ' || v_suffix)
  returning id into v_marca_id;

  insert into public.viatura_modelos (org_id, marca_id, nome)
  values (v_org_id, v_marca_id, 'Modelo Teste ' || v_suffix)
  returning id into v_modelo_id;

  insert into public.viaturas (org_id, matricula, marca_id, modelo_id, marca, modelo)
  values (v_org_id, 'AP' || upper(substr(v_suffix, 1, 8)), v_marca_id, v_modelo_id,
          'Marca Teste ' || v_suffix, 'Modelo Teste ' || v_suffix)
  returning id into v_viatura_id;

  insert into public.clientes (org_id, nome)
  values (v_org_id, 'Cliente Titular Teste ' || v_suffix)
  returning id into v_titular_id;

  insert into public.clientes (org_id, nome)
  values (v_org_id, 'Cliente Outro Teste ' || v_suffix)
  returning id into v_outro_id;

  insert into auth.users (id, email)
  values (gen_random_uuid(), 'ap-test-' || v_suffix || '@wegest-test.pt')
  returning id into v_user_id;

  insert into public.reservas (org_id, viatura_id, data_inicio, data_fim, cliente_id)
  values (v_org_id, v_viatura_id, now(), now() + interval '30 days', v_titular_id)
  returning id into v_reserva_id;

  insert into public.contratos_renting
    (org_id, reserva_id, cliente_id, viatura_id, data_inicio, data_fim, created_by)
  values
    (v_org_id, v_reserva_id, v_titular_id, v_viatura_id, now(), now() + interval '30 days', v_user_id)
  returning id into v_contrato_id;

  insert into public.contrato_cobrancas
    (org_id, contrato_id, periodo_de, periodo_ate, destinatario_id,
     destinatario_papel, destinatario_nome, valor_sem_iva, estado)
  values
    (v_org_id, v_contrato_id, current_date, current_date + 6, v_titular_id,
     'cliente', 'Cliente Titular Teste', 300, 'emitida')
  returning id into v_cobranca1_id;

  insert into public.contrato_cobrancas
    (org_id, contrato_id, periodo_de, periodo_ate, destinatario_id,
     destinatario_papel, destinatario_nome, valor_sem_iva, estado)
  values
    (v_org_id, v_contrato_id, current_date + 7, current_date + 13, v_titular_id,
     'cliente', 'Cliente Titular Teste', 300, 'emitida')
  returning id into v_cobranca2_id;

  -- Terceira cobrança, dedicada aos testes de liquidação da Task 4 — ver
  -- nota na secção "O seed produz" acima.
  insert into public.contrato_cobrancas
    (org_id, contrato_id, periodo_de, periodo_ate, destinatario_id,
     destinatario_papel, destinatario_nome, valor_sem_iva, estado)
  values
    (v_org_id, v_contrato_id, current_date + 14, current_date + 20, v_titular_id,
     'cliente', 'Cliente Titular Teste', 300, 'emitida')
  returning id into v_cobranca3_id;

  -- Motorista ligado ao MESMO utilizador do seed (v_user_id), para servir de
  -- "devedor" nos testes de autorização de acordo_vista_devedor.
  insert into public.motoristas_ativos (org_id, nome, user_id)
  values (v_org_id, 'Motorista Devedor Teste ' || v_suffix, v_user_id)
  returning id into v_motorista_id;

  create temporary table _ctx on commit drop as
    select v_cobranca1_id as cobranca_id, v_org_id as org_id, v_titular_id as destinatario_id;

  create temporary table _ctx2 on commit drop as
    select v_cobranca2_id as cobranca_id, v_org_id as org_id, v_titular_id as destinatario_id,
           v_outro_id as outro_cliente_id;

  create temporary table _ctx3 on commit drop as
    select v_cobranca3_id as cobranca_id, v_org_id as org_id, v_titular_id as destinatario_id,
           v_motorista_id as motorista_id, v_user_id as devedor_user_id,
           (select valor_total from public.contrato_cobrancas where id = v_cobranca3_id) as valor_total;
end $$;

-- ── Constraint: XOR do responsável ─────────────────────────────────────
prepare xor_invalido as
insert into public.acordos_pagamento
  (org_id, cobranca_id, titular_id, titular_nome,
   responsavel_cliente_id, responsavel_motorista_id, responsavel_papel, responsavel_nome,
   valor_total, frequencia)
select org_id, cobranca_id, destinatario_id, 'T', destinatario_id, null, 'motorista', 'R', 100, 'mensal'
  from _ctx;
select throws_ok('xor_invalido', null, null,
  'papel motorista com responsavel_cliente_id preenchido e rejeitado');

-- ── Constraint: parcela paga sem prova de liquidação ───────────────────
-- org_id omitido de propósito: exerce trg_acordos_set_org_id a derivá-lo a
-- partir da cobrança (é este acordo que a asserção final inspeciona).
insert into public.acordos_pagamento
  (cobranca_id, titular_id, titular_nome,
   responsavel_cliente_id, responsavel_papel, responsavel_nome, valor_total, frequencia)
select cobranca_id, destinatario_id, 'Titular',
       destinatario_id, 'cliente', 'Responsavel', 300, 'mensal'
  from _ctx;

prepare paga_sem_prova as
insert into public.acordo_parcelas (org_id, acordo_id, numero, data_vencimento, valor, estado)
select a.org_id, a.id, 1, current_date, 300, 'paga'
  from public.acordos_pagamento a order by a.created_at desc limit 1;
select throws_ok('paga_sem_prova', null, null,
  'parcela paga sem recibo_id e rejeitada pelo CHECK');

-- ── Índice: dois acordos vivos na mesma cobrança ───────────────────────
prepare segundo_acordo as
insert into public.acordos_pagamento
  (org_id, cobranca_id, titular_id, titular_nome,
   responsavel_cliente_id, responsavel_papel, responsavel_nome, valor_total, frequencia)
select org_id, cobranca_id, destinatario_id, 'Titular',
       destinatario_id, 'cliente', 'Responsavel', 300, 'mensal'
  from _ctx;
select throws_ok('segundo_acordo', null, null,
  'segundo acordo vivo na mesma cobranca e rejeitado pelo indice unico parcial');

-- ── org_id preenchido pelo trigger a partir da cobrança ────────────────
select is(
  (select count(*)::int from public.acordos_pagamento a join _ctx c on true
    where a.cobranca_id = c.cobranca_id and a.org_id = c.org_id),
  1, 'trigger preencheu org_id a partir da cobranca');

-- ── Trigger: titular fiscal é imutável ─────────────────────────────────
prepare titular_imutavel as
update public.acordos_pagamento
   set titular_id = (select outro_cliente_id from _ctx2)
 where cobranca_id = (select cobranca_id from _ctx);
select throws_ok('titular_imutavel', null, null,
  'titular_id do acordo e imutavel apos criacao e rejeitado pelo trigger');

-- ── Task 3: saldo por liquidar + acordo_criar ──────────────────────────

-- ── Saldo por liquidar ─────────────────────────────────────────────────
select is(
  public.cobranca_saldo_por_liquidar((select cobranca_id from _ctx)),
  (select valor_total from public.contrato_cobrancas where id = (select cobranca_id from _ctx)),
  'sem recibos nem NC, saldo por liquidar iguala o total');

-- ── acordo_criar rejeita soma errada ───────────────────────────────────
-- Usa _ctx2, não _ctx: _ctx já tem um acordo vivo (inserido acima, no bloco
-- "parcela paga sem prova de liquidação"), e acordo_criar verifica "já existe
-- acordo vivo" ANTES de verificar a soma das parcelas. Num cobranca com
-- acordo vivo, o erro apanhado seria sempre esse, nunca o de soma errada —
-- o que faria este teste passar pela razão errada. _ctx2 ainda não tem
-- nenhum acordo neste ponto do ficheiro.
prepare soma_errada as
select public.acordo_criar(
  (select cobranca_id from _ctx2), 'cliente', (select destinatario_id from _ctx2),
  '[{"numero":1,"data_vencimento":"2026-08-15","valor":1.00}]'::jsonb,
  'mensal', 15::smallint, 3::smallint, null);
select throws_ok('soma_errada', 'P0001', null,
  'acordo_criar rejeita plano cuja soma nao bate certo com o saldo');

-- ── acordo_criar rejeita cobrança já com acordo vivo ───────────────────
-- (a Task 2 já inseriu um acordo vivo sobre esta cobrança)
prepare acordo_duplicado as
select public.acordo_criar(
  (select cobranca_id from _ctx), 'cliente', (select destinatario_id from _ctx),
  '[{"numero":1,"data_vencimento":"2026-08-15","valor":300.00}]'::jsonb,
  'mensal', 15::smallint, 3::smallint, null);
select throws_ok('acordo_duplicado', 'P0001', null,
  'acordo_criar rejeita cobranca que ja tem acordo vivo');

-- ── Cessão: responsável ≠ titular lança DOIS movimentos ────────────────
-- `_ctx2` já foi criada pelo seed hermético da Task 2 (segunda cobrança
-- 'emitida' sem acordo + um segundo cliente para assumir a dívida). Ainda
-- não tem nenhum acordo (o teste de soma errada acima falhou antes de
-- inserir nada), por isso este é o primeiro e único acordo criado sobre ela.

select lives_ok($$
  select public.acordo_criar(
    (select cobranca_id from _ctx2), 'condutor', (select outro_cliente_id from _ctx2),
    (select jsonb_build_array(jsonb_build_object(
       'numero', 1, 'data_vencimento', '2026-08-15',
       'valor', public.cobranca_saldo_por_liquidar((select cobranca_id from _ctx2))))),
    'mensal', 15::smallint, 3::smallint, null)
$$, 'acordo_criar com responsavel diferente do titular corre sem erro');

-- Todas as três asserções abaixo estão amarradas ao acordo desta cobrança
-- (_ctx2): o teste tem de dar o mesmo resultado numa base vazia e numa base
-- já cheia de outros movimentos de cessão de outras execuções/organizações.
select is(
  (select count(*)::int from public.conta_movimentos
    where origem = 'cessao' and acordo_id is not null
      and acordo_id in (select id from public.acordos_pagamento
                          where cobranca_id = (select cobranca_id from _ctx2))),
  2, 'cessao lancou exactamente dois movimentos (credito + debito)');

select is(
  (select tipo from public.conta_movimentos
    where origem = 'cessao' and entidade_id = (select destinatario_id from _ctx2)
      and acordo_id in (select id from public.acordos_pagamento
                          where cobranca_id = (select cobranca_id from _ctx2))),
  'credito', 'titular recebeu o CREDITO da cessao');

select is(
  (select tipo from public.conta_movimentos
    where origem = 'cessao' and entidade_id = (select outro_cliente_id from _ctx2)
      and acordo_id in (select id from public.acordos_pagamento
                          where cobranca_id = (select cobranca_id from _ctx2))),
  'debito', 'responsavel recebeu o DEBITO da cessao');

select is(
  (select cessao_aplicada from public.acordos_pagamento
    where cobranca_id = (select cobranca_id from _ctx2)),
  true, 'acordo ficou com cessao_aplicada = true');

-- ── acordo_criar rejeita cessao cancelada mas ainda por reverter ───────
-- Cancela o acordo de _ctx2 sem reverter os movimentos de cessão já lançados
-- acima (cessao_aplicada continua true) — é exactamente o cenário que a
-- guarda de "cessão por reverter" em acordo_criar tem de apanhar. Feito por
-- último para não perturbar as contagens das asserções de cessão anteriores.
update public.acordos_pagamento set estado = 'cancelado'
 where cobranca_id = (select cobranca_id from _ctx2);

prepare cessao_por_reverter as
select public.acordo_criar(
  (select cobranca_id from _ctx2), 'cliente', (select destinatario_id from _ctx2),
  (select jsonb_build_array(jsonb_build_object(
     'numero', 1, 'data_vencimento', '2026-08-15',
     'valor', public.cobranca_saldo_por_liquidar((select cobranca_id from _ctx2))))),
  'mensal', 15::smallint, 3::smallint, null);
select throws_ok('cessao_por_reverter', 'P0001', null,
  'acordo_criar rejeita novo acordo enquanto houver cessao cancelada por reverter');

-- ── Task 4: liquidação de parcela + vista do devedor ────────────────────
-- _ctx já tem um acordo vivo sem nenhuma parcela (o insert de "parcela paga
-- sem prova", mais acima, foi rejeitado de propósito pelo CHECK e não deixou
-- nada) e o acordo de _ctx2 ficou 'cancelado' com uma cessão por reverter
-- (último teste da Task 3, imediatamente acima) — acordo_parcela_liquidar
-- nunca promove um acordo cancelado (guard "AND estado <> 'cancelado'" na
-- migração), por isso a asserção "acordo passou a liquidado" do desenho
-- original da Task 4 nunca passaria em cima de nenhum dos dois. Constrói-se
-- aqui um terceiro par cobrança+acordo (_ctx3/_acordo3, responsável
-- 'motorista' ligado a v_user_id) dedicado só a este bloco — não depende de
-- nenhum estado deixado pelas secções anteriores, nem as perturba.
create temporary table _acordo3 on commit drop as
with novo as (
  insert into public.acordos_pagamento
    (cobranca_id, titular_id, titular_nome,
     responsavel_motorista_id, responsavel_papel, responsavel_nome,
     valor_total, frequencia)
  select cobranca_id, destinatario_id, 'Titular Liquidacao Teste',
         motorista_id, 'motorista', 'Motorista Devedor Teste',
         valor_total, 'mensal'
    from _ctx3
  returning id, org_id, cobranca_id, valor_total
)
select id as acordo_id, org_id, cobranca_id, valor_total from novo;

create temporary table _parcela3 on commit drop as
with nova as (
  insert into public.acordo_parcelas (org_id, acordo_id, numero, data_vencimento, valor)
  select org_id, acordo_id, 1, current_date, valor_total from _acordo3
  returning id
)
select id as parcela_id from nova;

-- Simula o dinheiro já recebido (recibo activo, valor = saldo total da
-- cobrança) e a parcela em 'liquidacao_pendente' — o estado que antecede
-- acordo_parcela_liquidar num fluxo real (RC ainda por confirmar).
insert into public.recibos (org_id, entidade_id, valor, data_recibo, metodo, referencia, estado)
select a.org_id, (select destinatario_id from _ctx3), a.valor_total, current_date,
       'transferencia', a.cobranca_id::text, 'ativo'
  from _acordo3 a;

update public.acordo_parcelas
   set estado = 'liquidacao_pendente',
       recibo_id = (select id from public.recibos
                     where referencia = (select cobranca_id::text from _acordo3)
                     order by created_at desc limit 1)
 where id = (select parcela_id from _parcela3);

-- Sem nenhuma identidade impersonada (o ambiente por omissão do pgTAP): nem
-- service_role nem staff da org, e sem sessão de motorista nenhuma — as duas
-- RPCs têm de falhar fechado para quem não está autorizado.
prepare liquidar_sem_permissao as
select public.acordo_parcela_liquidar((select parcela_id from _parcela3), null);
select throws_ok('liquidar_sem_permissao', 'P0001', null,
  'acordo_parcela_liquidar rejeita chamada sem permissao de servico/faturacao');

prepare vista_sem_permissao as
select public.acordo_vista_devedor((select acordo_id from _acordo3));
select throws_ok('vista_sem_permissao', 'P0001', null,
  'vista do devedor rejeita quem nao esta ligado ao acordo');

-- ── Autorização: staff autenticado de OUTRA organização é rejeitado ────
-- As duas RPCs acima são SECURITY DEFINER e por isso ignoram a RLS de quem
-- chama — o guard interno é a ÚNICA barreira. As duas asserções acima (sem
-- sessão nenhuma) cobrem o caso mais fácil de barrar; a ameaça real que o
-- guard foi escrito para apanhar é um utilizador AUTENTICADO, de uma
-- organização DIFERENTE da parcela/acordo, a tentar fechar a dívida de
-- outro tenant. Constrói-se aqui uma segunda org + um staff dela com
-- acesso de faturação PRÓPRIO (is_admin=true na SUA org) — não apenas sem
-- permissão nenhuma — para que o teste apanhe uma regressão em que o "AND"
-- do guard (org_id = get_current_org_id() AND has_renting_faturacao_access())
-- fosse trocado por um "OR": nesse caso um staff cross-org COM acesso próprio
-- passaria pelo guard incorrecto porque has_renting_faturacao_access() retorna
-- true, tornando (FALSE OR TRUE) = TRUE — discrimina que os dois guards (org
-- + permissão) estão acoplados e não podem ser reduzidos a um OR.
do $$
declare
  v_suffix2  text := replace(gen_random_uuid()::text, '-', '');
  v_org2_id  uuid;
  v_user2_id uuid;
begin
  insert into public.organizacoes (nome, codigo)
  values ('Org Acordos Teste B ' || v_suffix2, 'ap-test-b-' || v_suffix2)
  returning id into v_org2_id;

  insert into auth.users (id, email)
  values (gen_random_uuid(), 'ap-test-b-' || v_suffix2 || '@wegest-test.pt')
  returning id into v_user2_id;

  -- Sobrescreve a org activa que o trigger handle_new_user_org possa ter
  -- atribuído por omissão (ex.: a org "activa" mais antiga já existente na
  -- base) — para este teste a org activa TEM de ser esta segunda org,
  -- senão o "cross-org" estaria silenciosamente a testar a org errada.
  insert into public.user_org_ativa (user_id, org_id)
  values (v_user2_id, v_org2_id)
  on conflict (user_id) do update set org_id = excluded.org_id;

  insert into public.user_organizacoes (user_id, org_id, is_admin)
  values (v_user2_id, v_org2_id, true)
  on conflict (user_id, org_id) do update set is_admin = true;

  create temporary table _org2 on commit drop as
    select v_org2_id as org_id, v_user2_id as user_id;
end $$;

select set_config('request.jwt.claim.sub', (select user_id::text from _org2), true);
select set_config('request.jwt.claims',
  jsonb_build_object('sub', (select user_id from _org2), 'role', 'authenticated')::text,
  true);

-- Confirma que a segunda org resolve mesmo para este segundo utilizador
-- ANTES de a usar para testar as RPCs — sem isto, um throws_ok a seguir
-- podia estar "verde" só porque get_current_org_id() continuava NULL (o
-- mesmo efeito do caso sem sessão já coberto acima), não porque o guard
-- discriminou de facto uma org diferente da da parcela.
select is(
  public.get_current_org_id(),
  (select org_id from _org2),
  'staff da segunda organizacao autentica e resolve para a SUA org (nao para a org da parcela)');

prepare liquidar_cross_org as
select public.acordo_parcela_liquidar((select parcela_id from _parcela3), null);
select throws_ok('liquidar_cross_org', 'P0001', null,
  'acordo_parcela_liquidar rejeita staff autenticado de outra organizacao (mesmo com acesso de faturacao proprio)');

prepare vista_cross_org as
select public.acordo_vista_devedor((select acordo_id from _acordo3));
select throws_ok('vista_cross_org', 'P0001', null,
  'vista do devedor rejeita staff autenticado de outra organizacao (mesmo com acesso de faturacao proprio)');

-- Impersona o motorista responsável (o devedor) — cobre as duas
-- implementações de auth.uid(), tal como em rls_org_isolation.test.sql.
select set_config('request.jwt.claim.sub', (select devedor_user_id::text from _ctx3), true);
select set_config('request.jwt.claims',
  jsonb_build_object('sub', (select devedor_user_id from _ctx3), 'role', 'authenticated')::text,
  true);

select ok(
  NOT (public.acordo_vista_devedor((select acordo_id from _acordo3)) ? 'titular_nif'),
  'vista do devedor nao expoe o NIF do titular');

select is(
  (public.acordo_vista_devedor((select acordo_id from _acordo3)) -> 'parcelas' -> 0 ->> 'estado'),
  'paga', 'vista do devedor mostra liquidacao_pendente como paga');

-- Impersona o serviço (o mesmo caminho de um worker que reprocessa o
-- recibo→RC): limpa o sub do devedor e assume o role claim.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', jsonb_build_object('role', 'service_role')::text, true);

select lives_ok($$
  select public.acordo_parcela_liquidar((select parcela_id from _parcela3), null)
$$, 'acordo_parcela_liquidar corre sem erro');

select is(
  (select estado from public.acordo_parcelas where id = (select parcela_id from _parcela3)),
  'paga', 'parcela passou a paga');

select is(
  (select estado from public.acordos_pagamento where id = (select acordo_id from _acordo3)),
  'liquidado', 'acordo com todas as parcelas pagas passou a liquidado');

select is(
  (select estado::text from public.contrato_cobrancas where id = (select cobranca_id from _acordo3)),
  'paga', 'cobranca fecha porque o saldo real (nao a contagem de parcelas) chegou a zero');

-- Idempotência: reprocessar a mesma parcela (retry do worker) não faz nada demais.
-- As asserções anteriores (lives_ok + estado continua 'paga') não discriminam
-- nada: mesmo que o early return "IF v_parcela.estado = 'paga' THEN RETURN"
-- fosse apagado da migração, o UPDATE corria outra vez, não rebentava e
-- deixava estado='paga' na mesma — ficava tudo verde com o invariante
-- desaparecido. Comparar `now()`/pago_em também não ajudaria: dentro de uma
-- única transacção pgTAP, `now()` é o timestamp da transacção e é IGUAL nas
-- duas chamadas, com ou sem early return.
--
-- Em vez disso, a segunda chamada passa um p_invoice_id DIFERENTE do da
-- primeira (que foi NULL, ver chamada de liquidação acima) e depois
-- confirma-se que invoice_rc_id NÃO foi reescrito. O early return acontece
-- ANTES de qualquer escrita — por isso uma implementação genuinamente
-- idempotente deixa invoice_rc_id como estava (NULL); uma implementação
-- partida (early return removido) executa o UPDATE de novo e sobrescreve
-- invoice_rc_id com este novo valor — o que faria a asserção seguinte falhar.
-- Nota: invoice_rc_id tem FK para public.invoices(id) (20260724100000), e o
-- sentinel abaixo não existe lá de propósito — se o early return
-- desaparecer, o UPDATE nem chega a "suceder silenciosamente": rebenta logo
-- com violação de FK, e é o PRÓPRIO lives_ok a apanhar a regressão.
select lives_ok($$
  select public.acordo_parcela_liquidar((select parcela_id from _parcela3),
    '00000000-0000-0000-0000-00000000beef')
$$, 'segunda chamada a acordo_parcela_liquidar nao rebenta');

select ok(
  (select invoice_rc_id is distinct from '00000000-0000-0000-0000-00000000beef'::uuid
     from public.acordo_parcelas where id = (select parcela_id from _parcela3)),
  'segunda chamada nao reescreveu a parcela (early return antes de qualquer escrita)');

-- Rejeita liquidar sem recibo — reaproveita o acordo (ainda 'ativo') de
-- _ctx, que continua sem nenhuma parcela até este ponto do ficheiro (ver
-- nota no topo desta secção). Continua impersonado como service_role, para
-- que o guard de autorização não seja o que intercepta esta chamada.
create temporary table _acordo_ctx on commit drop as
select a.id as acordo_id, a.org_id
  from public.acordos_pagamento a
 where a.cobranca_id = (select cobranca_id from _ctx);

create temporary table _parcela_sem_recibo on commit drop as
with nova as (
  insert into public.acordo_parcelas (org_id, acordo_id, numero, data_vencimento, valor)
  select org_id, acordo_id, 1, current_date, 100 from _acordo_ctx
  returning id
)
select id as parcela_id from nova;

prepare liquidar_sem_recibo as
select public.acordo_parcela_liquidar((select parcela_id from _parcela_sem_recibo), null);
select throws_ok('liquidar_sem_recibo', 'P0001', null,
  'acordo_parcela_liquidar rejeita parcela sem recibo associado');

-- ── Task 5: faturacao_outbox + claim atómico ───────────────────────────
-- Reaproveita o acordo (ainda 'ativo') e a org de _ctx via _acordo_ctx,
-- criada na secção anterior — mas com parcelas NOVAS e dedicadas (numero
-- 2 em diante). numero=1 desse acordo já pertence a _parcela_sem_recibo, e
-- nenhuma asserção depois daquele bloco volta a olhar para este acordo, por
-- isso acrescentar linhas aqui não perturba nada anterior. Continua-se
-- impersonado como service_role (herdado do bloco de liquidação acima) —
-- irrelevante para o que se segue, porque este ficheiro nunca faz
-- `set role`: tudo corre sob o role de ligação (dono das tabelas), que a
-- RLS não restringe. As policies de faturacao_outbox só importam fora
-- deste ficheiro, num cliente real ligado como authenticated/service_role.
select has_table('public', 'faturacao_outbox', 'tabela faturacao_outbox existe');

select is(
  (select count(*)::int from pg_policies
    where schemaname='public' and tablename='faturacao_outbox'
      and policyname='rls_org_isolation' and permissive='RESTRICTIVE'),
  1, 'faturacao_outbox tem a policy RESTRICTIVE rls_org_isolation');

-- ── Claim nunca reclama, no total, mais do que p_max ───────────────────
-- FOR UPDATE SKIP LOCKED por si só só impede duas invocações agarrarem a
-- MESMA linha — não impede que, em conjunto, reclamem mais do que p_max.
-- Não há concorrência real numa única sessão pgTAP, mas isto exercita
-- directamente o mecanismo que a impede: a contagem de 'em_curso' +
-- LIMIT v_capacity. Com 3 linhas pendentes e 0 em_curso, p_max=2 só pode
-- devolver 2 — se o LIMIT fosse removido ou a contagem ignorada, isto
-- devolveria as 3.
create temporary table _parcelas_capacidade on commit drop as
with novas as (
  insert into public.acordo_parcelas (org_id, acordo_id, numero, data_vencimento, valor)
  select org_id, acordo_id, n, current_date, 50
    from _acordo_ctx, generate_series(2, 4) as n
  returning id, numero
)
select id as parcela_id, numero from novas;

insert into public.faturacao_outbox (org_id, tipo, idempotency_key, parcela_id, payload)
select (select org_id from _acordo_ctx), 'RC', 'RC:parcela:' || parcela_id::text, parcela_id, '{}'::jsonb
  from _parcelas_capacidade;

select is(
  (select count(*)::int from public.faturacao_outbox_claim(2)),
  2, 'claim(2) com 3 linhas pendentes e 0 em_curso reclama exactamente 2');

select is(
  (select count(*)::int from public.faturacao_outbox where estado = 'pendente'),
  1, 'a terceira linha pendente fica por reclamar — p_max nao e excedido no total');

-- Drena a linha que sobrou, para as próximas asserções partirem de uma
-- fila sem pendentes soltos a interferir na contagem seguinte.
select is(
  (select count(*)::int from public.faturacao_outbox_claim(10)),
  1, 'claim(10) drena a linha pendente que restava');

-- ── idempotency_key duplicada é rejeitada pelo esquema (23505) ─────────
-- Prova a defesa central da outbox: um segundo enqueue para a MESMA
-- parcela nunca chega a existir como linha 'pendente' — dedupe por
-- catch de 23505, não por um SELECT-antes-de-INSERT com race.
create temporary table _parcela_outbox on commit drop as
with nova as (
  insert into public.acordo_parcelas (org_id, acordo_id, numero, data_vencimento, valor)
  select org_id, acordo_id, 5, current_date, 50 from _acordo_ctx
  returning id
)
select id as parcela_id from nova;

insert into public.faturacao_outbox (org_id, tipo, idempotency_key, parcela_id, payload)
select (select org_id from _acordo_ctx), 'RC', 'RC:parcela:' || parcela_id::text, parcela_id, '{}'::jsonb
  from _parcela_outbox;

prepare idk_duplicada as
insert into public.faturacao_outbox (org_id, tipo, idempotency_key, parcela_id, payload)
select (select org_id from _acordo_ctx), 'RC', 'RC:parcela:' || parcela_id::text, parcela_id, '{}'::jsonb
  from _parcela_outbox;
select throws_ok('idk_duplicada', '23505', null,
  'idempotency_key duplicada e rejeitada — dupla emissao impossivel no esquema');

select is(
  (select count(*)::int from public.faturacao_outbox_claim(10)),
  1, 'claim reclama a linha pendente');

select is(
  (select estado from public.faturacao_outbox where parcela_id = (select parcela_id from _parcela_outbox)),
  'em_curso', 'linha reclamada ficou em_curso');

-- ── Reaper: linha presa em em_curso vai para suspenso, nunca de volta a pendente ──
-- Simula um drain anterior que morreu a meio (crash/timeout): a linha ficou
-- 'em_curso' com started_at há mais de 10 minutos. O reaper corre
-- incondicionalmente no início do claim, antes de qualquer cálculo de
-- capacidade — por isso usa-se p_max=0 para isolar só o efeito do reaper
-- (nao ha folga nenhuma para reclamar mais nada a seguir).
create temporary table _parcela_outbox_presa on commit drop as
with nova as (
  insert into public.acordo_parcelas (org_id, acordo_id, numero, data_vencimento, valor)
  select org_id, acordo_id, 6, current_date, 50 from _acordo_ctx
  returning id
)
select id as parcela_id from nova;

insert into public.faturacao_outbox
  (org_id, tipo, idempotency_key, parcela_id, payload, estado, started_at)
select (select org_id from _acordo_ctx), 'RC', 'RC:parcela:' || parcela_id::text, parcela_id, '{}'::jsonb,
       'em_curso', now() - interval '11 minutes'
  from _parcela_outbox_presa;

select public.faturacao_outbox_claim(0);

select is(
  (select estado from public.faturacao_outbox
    where parcela_id = (select parcela_id from _parcela_outbox_presa)),
  'suspenso', 'linha presa em em_curso ha mais de 10 min foi para suspenso pelo reaper');

select is(
  (select needs_reconcile from public.faturacao_outbox
    where parcela_id = (select parcela_id from _parcela_outbox_presa)),
  true, 'reaper marca needs_reconcile — resultado desconhecido no provider nunca e reemitido sozinho');

-- Repõe o ambiente antes do finish() (por higiene; o rollback final já o
-- desfaria de qualquer forma).
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claims', '', true);

select * from finish();
rollback;
